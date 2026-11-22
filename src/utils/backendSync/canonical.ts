/**
 * Deterministic JSON: object keys sorted, `undefined` members dropped, so two
 * documents with the same content serialize identically regardless of key
 * order or object identity.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? 'null';
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'number' && !Number.isFinite(value) ? null : value;
  }
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : canonicalize(item)));
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const member = (value as Record<string, unknown>)[key];
    if (member !== undefined && typeof member !== 'function') result[key] = canonicalize(member);
  }
  return result;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
