/**
 * Matching helpers for the Settings search. Sections are matched against the
 * text they actually render, so new settings become searchable without a
 * maintained keyword list.
 */

/** Attributes that carry user-facing text not present in text nodes. */
export const SETTINGS_SEARCH_ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt', 'data-tooltip'];

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
const GENERIC_TAGS = new Set(['SPAN', 'DIV']);

// `aria-label` is not exposed on generic elements, e.g. the "More info"
// tooltip markers, which would otherwise make every section match "info".
const isReadableAttribute = (element: Element, name: string) =>
  name !== 'aria-label' || !GENERIC_TAGS.has(element.tagName.toUpperCase()) || element.hasAttribute('role');

/** Lowercases, removes diacritics and collapses whitespace. */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Splits a query into normalized words; an empty result means "not searching". */
export function getSearchTerms(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(' ') : [];
}

/**
 * Collects the normalized text of a rendered element, including labelling
 * attributes. Icon ligatures and other `aria-hidden` or `hidden` descendants
 * are ignored because they are not readable setting text.
 */
export function getSearchableText(root: Element): string {
  const parts: string[] = [];
  const addAttributes = (element: Element) => {
    for (const name of SETTINGS_SEARCH_ATTRIBUTES) {
      const value = isReadableAttribute(element, name) ? element.getAttribute(name) : null;
      if (value) parts.push(' ', value, ' ');
    }
  };

  addAttributes(root);
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return NodeFilter.FILTER_ACCEPT;
      const element = node as Element;
      return SKIPPED_TAGS.has(element.tagName.toUpperCase())
        || element.hasAttribute('hidden')
        || element.getAttribute('aria-hidden') === 'true'
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue ?? '');
    } else {
      // Element boundaries separate words, e.g. a label followed by its help text.
      parts.push(' ');
      addAttributes(node as Element);
    }
  }
  return normalizeSearchText(parts.join(''));
}

/** True when every term occurs in the normalized text. */
export function matchesSearchTerms(text: string, terms: readonly string[]): boolean {
  return terms.every(term => text.includes(term));
}
