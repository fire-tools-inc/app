import { SYNC_ADAPTERS } from '../../src/utils/backendSync/adapters';
import type { Changeset, Entity, NormalizedDoc, SyncDomain } from '../../src/utils/backendSync/types';
import { SYNC_DOMAINS, isSyncDomain } from '../../src/utils/backendSync/types';

interface DomainState {
  revision: number;
  initialized: boolean;
  doc: NormalizedDoc;
}

export interface RecordedRequest {
  method: string;
  path: string;
  body: Changeset | undefined;
  headers: Record<string, string>;
}

type Validator = (changeset: Changeset) => { status: number; code: string; message: string; details?: unknown } | null;

const PARENT_COLLECTIONS = new Set(['years', 'months']);

const emptyDoc = (): NormalizedDoc => ({ set: {}, collections: {} });

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

type Loose = Record<string, unknown> & { years?: Loose[]; months?: Loose[] };
const flag = (target: Loose, name: string) => { target[name] = target[name] === true; };

function withExplicitFlags(domain: SyncDomain, doc: Record<string, unknown>): Record<string, unknown> {
  const loose = doc as Loose;
  if (domain === 'assetAllocation') (loose.assets as Loose[]).forEach((asset) => flag(asset, 'isPrimaryResidence'));
  if (domain === 'expenseTracker' || domain === 'netWorth') {
    for (const year of loose.years ?? []) {
      flag(year, 'isArchived');
      for (const month of year.months ?? []) {
        if (domain === 'expenseTracker') {
          flag(month, 'isClosed');
          for (const entry of [...(month.expenses as Loose[]), ...(month.incomes as Loose[])]) flag(entry, 'isRecurring');
        } else {
          (month.assets as Loose[]).forEach((asset) => flag(asset, 'isPrimaryResidence'));
        }
      }
    }
  }
  if (domain === 'netWorth') flag(loose.settings as Loose, 'syncWithAssetAllocation');
  return doc;
}

/**
 * In-memory implementation of the `/sync/status` and `/state/{domain}`
 * contract, reusing the renderer adapters to assemble documents.
 */
export class FakeSyncServer {
  instanceId = 'instance-a';
  requiredToken: string | null = null;
  offline = false;
  statusNotFound = false;
  readonly requests: RecordedRequest[] = [];
  readonly validators: Partial<Record<SyncDomain, Validator>> = {};
  private domains = {} as Record<SyncDomain, DomainState>;

  constructor() {
    for (const domain of SYNC_DOMAINS) this.domains[domain] = { revision: 0, initialized: false, doc: emptyDoc() };
  }

  revision(domain: SyncDomain): number {
    return this.domains[domain].revision;
  }

  isInitialized(domain: SyncDomain): boolean {
    return this.domains[domain].initialized;
  }

  /**
   * The document `GET /state/{domain}` returns. Like the real backend it
   * always sends the optional flags as booleans.
   */
  data(domain: SyncDomain): unknown {
    const state = this.domains[domain];
    const adapter = SYNC_ADAPTERS[domain];
    const hasRows = Object.values(state.doc.collections).some((rows) => Object.keys(rows).length > 0);
    const hasSingletons = Object.values(state.doc.set).some((value) => value !== null && value !== undefined);
    if (!hasRows && !hasSingletons) return null;
    const doc = structuredClone(adapter.denormalize(state.doc)) as Record<string, unknown> | null;
    return doc ? withExplicitFlags(domain, doc) : null;
  }

  /** Seeds a domain as if written earlier (e.g. by an agent before first boot). */
  seed(domain: SyncDomain, doc: unknown, initialized: boolean): void {
    const state = this.domains[domain];
    state.doc = structuredClone(SYNC_ADAPTERS[domain].normalize(doc));
    state.initialized = initialized;
    state.revision += 1;
  }

  /** Simulates a granular API write by another client, such as an agent. */
  agentWrite(domain: SyncDomain, changeset: Changeset): void {
    this.apply(domain, structuredClone(changeset), false);
    this.domains[domain].revision += 1;
  }

  requestsTo(method: string, path: string): RecordedRequest[] {
    return this.requests.filter((request) => request.method === method && request.path === path);
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    if (this.offline) throw new TypeError('Failed to fetch');
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = { ...((init.headers ?? {}) as Record<string, string>) };
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as Changeset : undefined;
    this.requests.push({ method, path, body, headers });

    if (this.requiredToken && path !== '/health' && headers.Authorization !== `Bearer ${this.requiredToken}`) {
      return json(401, { error: { code: 'unauthorized', message: 'A valid bearer token is required.' } });
    }
    if (path === '/sync/status' && method === 'GET') {
      if (this.statusNotFound) return json(404, { error: { code: 'not_found', message: 'Route not found' } });
      const domains = Object.fromEntries(SYNC_DOMAINS.map((domain) => [domain, {
        revision: this.domains[domain].revision,
        initialized: this.domains[domain].initialized,
      }]));
      return json(200, { instanceId: this.instanceId, domains });
    }
    const match = /^\/state\/([A-Za-z]+)$/.exec(path);
    if (!match || !isSyncDomain(match[1])) return json(404, { error: { code: 'not_found', message: 'Unknown domain' } });
    const domain = match[1];
    const state = this.domains[domain];
    if (method === 'GET') {
      return json(200, { domain, instanceId: this.instanceId, revision: state.revision, initialized: state.initialized, data: this.data(domain) });
    }
    if (method !== 'PATCH' && method !== 'PUT') return json(405, { error: { code: 'method_not_allowed', message: 'Method not allowed' } });
    const changeset = body ?? {};
    const failure = this.validators[domain]?.(changeset);
    if (failure) {
      return json(failure.status, { error: { code: failure.code, message: failure.message, ...(failure.details ? { details: failure.details } : {}) } });
    }
    const previousRevision = state.revision;
    const wrote = this.apply(domain, structuredClone(changeset), method === 'PUT');
    if (wrote) state.revision += 1;
    if (changeset.initialize) state.initialized = true;
    return json(200, { domain, revision: state.revision, previousRevision, initialized: state.initialized });
  };

  private apply(domain: SyncDomain, changeset: Changeset, replace: boolean): boolean {
    const adapter = SYNC_ADAPTERS[domain];
    const state = this.domains[domain];
    let wrote = false;
    if (replace) {
      wrote = Object.values(state.doc.collections).some((rows) => Object.keys(rows).length > 0)
        || Object.values(state.doc.set).some((value) => value !== null && value !== undefined);
      state.doc = emptyDoc();
    }
    const doc = state.doc;
    const rows = (collection: string) => (doc.collections[collection] ??= {});
    const leafCollections = adapter.collections.filter((collection) => !PARENT_COLLECTIONS.has(collection));

    const deletes = changeset.delete ?? {};
    for (const collection of [...leafCollections, 'months', 'years']) {
      for (const key of deletes[collection] ?? []) {
        wrote = true;
        const target = rows(collection);
        const removed = target[key];
        delete target[key];
        if (removed && (collection === 'months' || collection === 'years')) {
          for (const leaf of [...leafCollections, ...(collection === 'years' ? ['months'] : [])]) {
            for (const [leafKey, entity] of Object.entries(rows(leaf))) {
              const sameYear = entity.year === removed.year;
              const sameMonth = collection === 'years' || entity.month === removed.month;
              if (entity.year !== undefined && sameYear && sameMonth) delete rows(leaf)[leafKey];
            }
          }
        }
      }
    }
    for (const [key, value] of Object.entries(changeset.set ?? {})) {
      wrote = true;
      doc.set[key] = value;
    }
    for (const collection of ['years', 'months', ...leafCollections]) {
      for (const entity of (changeset.upsert ?? {})[collection] ?? []) {
        wrote = true;
        rows(collection)[adapter.keyOf(collection, entity)] = entity;
        if (typeof entity.year === 'number' && typeof entity.month === 'number' && adapter.collections.includes('months') && collection !== 'months') {
          const parentKey = monthKey(entity.year, entity.month);
          rows('months')[parentKey] ??= domain === 'netWorth'
            ? { year: entity.year, month: entity.month, isFrozen: false } as Entity
            : { year: entity.year, month: entity.month } as Entity;
        }
        if (typeof entity.year === 'number' && adapter.collections.includes('years') && collection !== 'years') {
          rows('years')[String(entity.year)] ??= { year: entity.year } as Entity;
        }
      }
    }
    return wrote;
  }
}
