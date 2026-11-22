import { logger } from '../../logger';
import type { Entity } from '../types';

export const pad2 = (value: number): string => String(value).padStart(2, '0');
export const yearKey = (year: number): string => String(year);
export const monthKey = (year: number, month: number): string => `${year}-${pad2(month)}`;

/** Copies `value` without `undefined` members, so optional keys stay absent. */
export function compact<T extends Record<string, unknown>>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(value)) if (member !== undefined) result[key] = member;
  return result as T;
}

/**
 * Optional flags the backend always returns as booleans. The renderer treats
 * a missing flag as false, so `false` is normalized to "absent" for
 * comparisons and diffs.
 */
export const OPTIONAL_FLAGS = ['isArchived', 'isClosed', 'isRecurring', 'isPrimaryResidence', 'syncWithAssetAllocation'] as const;

export function withoutFalseFlags<T extends Record<string, unknown>>(value: T): T {
  const result: Record<string, unknown> = { ...value };
  for (const flag of OPTIONAL_FLAGS) {
    if (flag in result && (result[flag] === false || result[flag] === undefined || result[flag] === null)) delete result[flag];
  }
  return result as T;
}

/** The acquisition-price backfill the local loaders apply, so both copies compare equal. */
export function withAcquisitionPrice(entity: Entity): Entity {
  return entity.acquisitionPrice === undefined && typeof entity.pricePerShare === 'number'
    ? { ...entity, acquisitionPrice: entity.pricePerShare }
    : entity;
}

export function omit(entity: Entity, fields: readonly string[]): Entity {
  const result: Entity = {};
  for (const [key, value] of Object.entries(entity)) if (!fields.includes(key)) result[key] = value;
  return result;
}

export function byPosition(a: Entity, b: Entity): number {
  const left = typeof a.position === 'number' ? a.position : Number.MAX_SAFE_INTEGER;
  const right = typeof b.position === 'number' ? b.position : Number.MAX_SAFE_INTEGER;
  return left - right;
}

/**
 * Adds an id-keyed entity. Duplicate ids cannot be stored by the backend
 * (unique per user), so a later duplicate gets a deterministic new id rather
 * than silently replacing the earlier entry.
 */
export function addById(target: Record<string, Entity>, collection: string, entity: Entity): void {
  const id = typeof entity.id === 'string' && entity.id ? entity.id : 'entry';
  if (!(id in target)) {
    target[id] = entity;
    return;
  }
  let suffix = 2;
  while (`${id}~${suffix}` in target) suffix += 1;
  const renamed = `${id}~${suffix}`;
  logger.warn('backend-sync', 'duplicate-id', 'A duplicated entry id was renamed so both entries are kept.', {
    pii: { collection, id, renamed },
  });
  target[renamed] = { ...entity, id: renamed };
}

/** Adds an entity whose key is a natural identity (category, month); the last one wins. */
export function addByKey(target: Record<string, Entity>, collection: string, key: string, entity: Entity): void {
  if (key in target) {
    logger.warn('backend-sync', 'duplicate-key', 'A duplicated entry was replaced by the later one with the same key.', {
      pii: { collection, key },
    });
  }
  target[key] = entity;
}

export function numberField(entity: Entity, field: string, fallback: number): number {
  const value = entity[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
