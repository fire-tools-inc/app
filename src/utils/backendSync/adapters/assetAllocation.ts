import type { AllocationMode, Asset, AssetClass } from '../../../types/assetAllocation';
import { clearAssetAllocation, loadAssetAllocation, saveAssetAllocation } from '../../cookieStorage';
import { DEFAULT_ALLOCATION_PAGE_TARGETS, DEFAULT_ASSETS } from '../../defaultAssets';
import { DEFAULT_ASSET_CLASS_TARGETS } from '../../dataSync';
import { canonicalStringify, isPlainObject } from '../canonical';
import type { DomainAdapter, Entity } from '../types';
import { addById, byPosition, omit, withAcquisitionPrice, withoutFalseFlags } from './shared';

export type AssetClassTargets = Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }>;

export interface AssetAllocationDoc {
  assets: Asset[];
  assetClassTargets: AssetClassTargets | null;
}

/** The untouched sample portfolio, as saved by the page and as read back by `loadAssetAllocation()`. */
const assetsSnapshot = (assets: Asset[]): string => canonicalStringify(
  assets.map((asset) => withoutFalseFlags(asset as unknown as Entity)),
);

const sampleAssetSnapshots = (): Set<string> => new Set([
  assetsSnapshot(DEFAULT_ASSETS),
  assetsSnapshot(DEFAULT_ASSETS.map((asset) => (
    asset.acquisitionPrice === undefined && asset.pricePerShare !== undefined
      ? { ...asset, acquisitionPrice: asset.pricePerShare }
      : asset
  ))),
]);

const defaultTargetSnapshots = (): Set<string> => new Set([
  canonicalStringify(DEFAULT_ALLOCATION_PAGE_TARGETS),
  canonicalStringify(DEFAULT_ASSET_CLASS_TARGETS),
]);

export const assetAllocationAdapter: DomainAdapter<AssetAllocationDoc> = {
  domain: 'assetAllocation',
  singletons: ['assetClassTargets'],
  collections: ['assets'],

  readLocal() {
    const { assets, assetClassTargets } = loadAssetAllocation();
    if (!assets && !assetClassTargets) return null;
    return { assets: assets ?? [], assetClassTargets };
  },

  writeLocalCache(doc) {
    if (!doc) clearAssetAllocation();
    else saveAssetAllocation(doc.assets, doc.assetClassTargets);
  },

  normalize(doc) {
    const assets: Record<string, Entity> = {};
    (doc?.assets ?? []).forEach((asset, position) => {
      addById(assets, 'assets', withAcquisitionPrice(withoutFalseFlags({ ...(asset as unknown as Entity), position })));
    });
    return { set: { assetClassTargets: doc?.assetClassTargets ?? null }, collections: { assets } };
  },

  keyOf: (_collection, entity) => String(entity.id),

  denormalize(maps) {
    const assets = Object.values(maps.collections.assets ?? {})
      .sort(byPosition)
      .map((entity) => omit(entity, ['position']) as unknown as Asset);
    const targets = maps.set.assetClassTargets;
    const assetClassTargets = isPlainObject(targets) ? (targets as AssetClassTargets) : null;
    if (!assets.length && !assetClassTargets) return null;
    return { assets, assetClassTargets };
  },

  isEmpty(doc) {
    if (!doc) return true;
    const assetsEmpty = doc.assets.length === 0 || sampleAssetSnapshots().has(assetsSnapshot(doc.assets));
    const targetsEmpty = !doc.assetClassTargets || defaultTargetSnapshots().has(canonicalStringify(doc.assetClassTargets));
    return assetsEmpty && targetsEmpty;
  },
};
