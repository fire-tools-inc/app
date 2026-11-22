/**
 * Local expense categorization with BM25.
 *
 * The index combines the user's own expense history (description -> category
 * and Need/Want choice) with a small generic seed lexicon. Everything runs on
 * this device; nothing is sent anywhere. History outweighs the seed, so the
 * suggestions follow how the user actually files expenses.
 */
import {
  getAllCategories,
  getCategoryInfo,
  NO_CATEGORY_ID,
  resolveCategoryAlias,
  type ExpenseTrackerData,
  type ExpenseType,
} from '../types/expenseTracker';
import { EXPENSE_SEED_LEXICON, type ExpenseSeedLexicon } from './expenseSeedLexicon';

export type ExpenseMatchSource = 'history' | 'seed';

export interface CategorySuggestion {
  category: string;
  /** Normalized in [0, 1]. */
  confidence: number;
  source: ExpenseMatchSource;
}

export interface ExpenseMatch {
  /** Suggested category id, or NO_CATEGORY_ID when nothing matched. */
  category: string;
  expenseType: ExpenseType;
  /** Normalized in [0, 1]; 0 when nothing matched. */
  confidence: number;
  source: ExpenseMatchSource | 'none';
  /** Up to three other plausible categories, best first. */
  alternatives: CategorySuggestion[];
}

export interface ExpenseMatcher {
  match(description: string): ExpenseMatch;
  /** Number of distinct history descriptions the index learned from. */
  readonly historySize: number;
}

const K1 = 1.2;
const B = 0.75;
/** Seed documents count less than one real past expense. */
const SEED_WEIGHT = 0.35;
/** An identical past description is a strong signal on top of its BM25 score. */
const EXACT_MATCH_BOOST = 2;
const SEED_MAX_CONFIDENCE = 0.8;
const MAX_ALTERNATIVES = 3;
const TOP_DOCUMENTS = 40;

const STOPWORDS = new Set([
  // English
  'the', 'and', 'for', 'with', 'from', 'to', 'of', 'in', 'on', 'at', 'my', 'an', 'by', 'per', 'via', 'or',
  'our', 'some', 'this', 'that', 'new', 'paid', 'payment', 'purchase', 'order',
  // Italian
  'il', 'lo', 'la', 'le', 'gli', 'di', 'da', 'del', 'della', 'delle', 'dei', 'degli', 'con', 'al', 'alla',
  'su', 'un', 'una', 'uno', 'ed', 'per', 'pagamento', 'acquisto',
  // German
  'der', 'die', 'das', 'und', 'mit', 'fur', 'von', 'zum', 'zur', 'im', 'am', 'ein', 'eine', 'den', 'dem', 'des',
  'zahlung', 'kauf',
  // French
  'les', 'du', 'et', 'avec', 'pour', 'au', 'aux', 'en', 'une', 'paiement', 'achat',
  // Spanish
  'el', 'los', 'las', 'para', 'por', 'pago',
  // Dutch
  'de', 'het', 'een', 'en', 'van', 'voor', 'met', 'op',
  // Currency words and URL noise
  'eur', 'euro', 'euros', 'usd', 'gbp', 'chf', 'jpy', 'aud', 'cad', 'dollar', 'dollars', 'com', 'www', 'http', 'https',
]);

const AMOUNT_LIKE = /^(?:\d+(?:x|k|st|nd|rd|th|h|am|pm|eur|usd|gbp|chf)?|x\d+)$/;

function stem(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|z)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !/(?:ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
}

/**
 * Normalize a description into search terms: strip diacritics and case, join
 * brand spellings (McDonald's, H&M), drop numbers, amounts, dates, very short
 * words and common stopwords, and fold simple plurals.
 */
export function tokenizeExpenseText(text: string): string[] {
  const normalized = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    // Italian/French elision (l'affitto, d'acqua, dell'hotel) keeps only the noun.
    .replace(/(^|[^\p{L}])(?:l|d|j|c|m|n|s|t|qu|dell|all|dall|nell|sull|un)['’](?=\p{L})/gu, '$1')
    .replace(/(\p{L})['’`´](\p{L})/gu, '$1$2')
    .replace(/(\p{L})&(\p{L})/gu, '$1$2');
  const tokens: string[] = [];
  for (const raw of normalized.split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || AMOUNT_LIKE.test(raw) || STOPWORDS.has(raw)) continue;
    const token = stem(raw);
    if (token.length >= 2) tokens.push(token);
  }
  return tokens;
}

function documentTerms(tokens: string[]): string[] {
  const terms = [...tokens];
  for (let index = 1; index < tokens.length; index++) terms.push(`${tokens[index - 1]}_${tokens[index]}`);
  return terms;
}

interface MatchDocument {
  key: string;
  source: ExpenseMatchSource;
  length: number;
  terms: Map<string, number>;
  categories: Map<string, number>;
  expenseTypes: Map<string, { NEED: number; WANT: number }>;
  total: number;
}

interface Posting { doc: number; tf: number }

function addDocument(docs: MatchDocument[], byKey: Map<string, MatchDocument>, tokens: string[], source: ExpenseMatchSource,
  category: string, expenseType?: ExpenseType): void {
  const key = `${source}:${tokens.join(' ')}`;
  let doc = byKey.get(key);
  if (!doc) {
    const terms = new Map<string, number>();
    const all = documentTerms(tokens);
    for (const term of all) terms.set(term, (terms.get(term) ?? 0) + 1);
    doc = { key, source, length: all.length, terms, categories: new Map(), expenseTypes: new Map(), total: 0 };
    byKey.set(key, doc);
    docs.push(doc);
  }
  doc.total += 1;
  doc.categories.set(category, (doc.categories.get(category) ?? 0) + 1);
  if (expenseType) {
    const votes = doc.expenseTypes.get(category) ?? { NEED: 0, WANT: 0 };
    votes[expenseType] += 1;
    doc.expenseTypes.set(category, votes);
  }
}

const round = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;

/**
 * Build a matcher from the tracker's full history plus the seed lexicon.
 * Only categories that currently exist (built-in, overridden or custom) are
 * suggested; retired built-in ids in history count toward their replacement.
 */
export function buildExpenseMatcher(
  data: Pick<ExpenseTrackerData, 'years' | 'customCategories' | 'categoryOverrides'> | null | undefined,
  seed: ExpenseSeedLexicon = EXPENSE_SEED_LEXICON,
): ExpenseMatcher {
  const allowed = new Set(getAllCategories(data?.customCategories, data?.categoryOverrides).map(category => category.id));
  allowed.delete(NO_CATEGORY_ID);
  const docs: MatchDocument[] = [];
  const byKey = new Map<string, MatchDocument>();
  let historySize = 0;
  for (const year of data?.years ?? []) {
    for (const month of year.months ?? []) {
      for (const expense of month.expenses ?? []) {
        if (typeof expense.description !== 'string' || typeof expense.category !== 'string') continue;
        const category = resolveCategoryAlias(expense.category);
        if (!allowed.has(category)) continue;
        const tokens = tokenizeExpenseText(expense.description);
        if (!tokens.length) continue;
        const before = docs.length;
        addDocument(docs, byKey, tokens, 'history', category,
          expense.expenseType === 'NEED' || expense.expenseType === 'WANT' ? expense.expenseType : undefined);
        if (docs.length > before) historySize += 1;
      }
    }
  }
  for (const [category, phrases] of Object.entries(seed)) {
    if (!allowed.has(category)) continue;
    for (const phrase of phrases ?? []) {
      const tokens = tokenizeExpenseText(phrase);
      if (tokens.length) addDocument(docs, byKey, tokens, 'seed', category);
    }
  }

  const postings = new Map<string, Posting[]>();
  let totalLength = 0;
  docs.forEach((doc, index) => {
    totalLength += doc.length;
    for (const [term, tf] of doc.terms) {
      let list = postings.get(term);
      if (!list) { list = []; postings.set(term, list); }
      list.push({ doc: index, tf });
    }
  });
  const averageLength = docs.length ? totalLength / docs.length : 1;
  const idf = (term: string): number => {
    const n = postings.get(term)?.length ?? 0;
    return Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
  };

  const noMatch = (): ExpenseMatch => ({
    category: NO_CATEGORY_ID, expenseType: getCategoryInfo(NO_CATEGORY_ID).defaultExpenseType,
    confidence: 0, source: 'none', alternatives: [],
  });

  const match = (description: string): ExpenseMatch => {
    const tokens = tokenizeExpenseText(description);
    if (!tokens.length || !docs.length) return noMatch();
    const queryTerms = [...new Set(documentTerms(tokens))];
    const unigrams = new Set(tokens);
    const scores = new Map<number, number>();
    const matchedTerms = new Map<number, string[]>();
    for (const term of queryTerms) {
      const list = postings.get(term);
      if (!list) continue;
      const weight = idf(term);
      for (const { doc, tf } of list) {
        const length = docs[doc].length;
        const score = weight * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * length / averageLength));
        scores.set(doc, (scores.get(doc) ?? 0) + score);
        const terms = matchedTerms.get(doc) ?? [];
        terms.push(term);
        matchedTerms.set(doc, terms);
      }
    }
    if (!scores.size) return noMatch();
    const exactKey = `history:${tokens.join(' ')}`;
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_DOCUMENTS);
    const categoryScores = new Map<string, { history: number; seed: number; covered: Set<string>; exact: number }>();
    const typeVotes = new Map<string, { NEED: number; WANT: number }>();
    for (const [index, score] of ranked) {
      const doc = docs[index];
      const exact = doc.key === exactKey;
      const frequency = doc.source === 'history' ? 1 + Math.log(doc.total) : SEED_WEIGHT;
      for (const [category, count] of doc.categories) {
        const share = count / doc.total;
        const entry = categoryScores.get(category) ?? { history: 0, seed: 0, covered: new Set<string>(), exact: 0 };
        const contribution = score * share * frequency * (exact ? 1 + EXACT_MATCH_BOOST : 1);
        if (doc.source === 'history') entry.history += contribution;
        else entry.seed += contribution;
        if (exact) entry.exact = Math.max(entry.exact, share);
        for (const term of matchedTerms.get(index) ?? []) if (unigrams.has(term)) entry.covered.add(term);
        categoryScores.set(category, entry);
        const votes = doc.expenseTypes.get(category);
        if (votes) {
          const total = typeVotes.get(category) ?? { NEED: 0, WANT: 0 };
          total.NEED += votes.NEED * contribution;
          total.WANT += votes.WANT * contribution;
          typeVotes.set(category, total);
        }
      }
    }
    const totals = [...categoryScores.entries()]
      .map(([category, entry]) => ({ category, entry, score: entry.history + entry.seed }))
      .sort((a, b) => b.score - a.score);
    const sum = totals.reduce((total, item) => total + item.score, 0);
    if (!sum) return noMatch();
    const confidenceOf = (item: typeof totals[number]): number => {
      const coverage = item.entry.covered.size / unigrams.size;
      let confidence = (item.score / sum) * (0.4 + 0.6 * coverage);
      if (item.entry.exact > 0) confidence = Math.max(confidence, 0.9 * item.entry.exact);
      // Generic vocabulary alone never claims certainty.
      if (item.entry.history < item.entry.seed) confidence = Math.min(confidence, SEED_MAX_CONFIDENCE);
      return round(confidence);
    };
    const sourceOf = (item: typeof totals[number]): ExpenseMatchSource =>
      item.entry.history >= item.entry.seed ? 'history' : 'seed';
    const [best, ...rest] = totals;
    const votes = typeVotes.get(best.category);
    const expenseType: ExpenseType = votes && votes.NEED + votes.WANT > 0
      ? (votes.NEED > votes.WANT ? 'NEED' : 'WANT')
      : getCategoryInfo(best.category, data?.customCategories, data?.categoryOverrides).defaultExpenseType;
    return {
      category: best.category,
      expenseType,
      confidence: confidenceOf(best),
      source: sourceOf(best),
      alternatives: rest.slice(0, MAX_ALTERNATIVES).map(item => ({
        category: item.category, confidence: confidenceOf(item), source: sourceOf(item),
      })),
    };
  };

  return { match, historySize };
}

const matcherCache = new WeakMap<object, ExpenseMatcher>();

/** Matcher for this exact tracker snapshot, built once and reused while the reference is unchanged. */
export function getExpenseMatcher(data: ExpenseTrackerData | null | undefined): ExpenseMatcher {
  if (!data) return buildExpenseMatcher(null);
  let matcher = matcherCache.get(data);
  if (!matcher) {
    matcher = buildExpenseMatcher(data);
    matcherCache.set(data, matcher);
  }
  return matcher;
}

export function matchExpenseCategory(description: string, data: ExpenseTrackerData | null | undefined): ExpenseMatch {
  return getExpenseMatcher(data).match(description);
}
