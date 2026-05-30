import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { handler, resolveUserId, apiError, nowIso } from '../http.js';

const VALID_DIMENSIONS = new Set(['currency', 'holding', 'sector', 'continent', 'region', 'market', 'etfProvider']);

interface AssetRow {
  id: number;
  external_id: string;
  name: string;
  ticker: string;
  current_value: number;
  original_currency: string | null;
}

interface MetadataRow {
  ticker: string;
  quote_type: string | null;
  long_name: string | null;
  short_name: string | null;
  currency: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  fund_family: string | null;
  category: string | null;
  sector_weightings_json: string | null;
  region_weightings_json: string | null;
  error: string | null;
  fetched_at: string;
}

interface SectorWeight {
  sector: string;
  weight: number;
}
interface RegionWeight {
  region: string;
  weight: number;
}

const parseJsonArray = <T>(raw: string | null): T[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const mapMetadata = (row: MetadataRow) => ({
  ticker: row.ticker,
  quoteType: row.quote_type,
  longName: row.long_name,
  shortName: row.short_name,
  currency: row.currency,
  exchange: row.exchange,
  sector: row.sector,
  industry: row.industry,
  country: row.country,
  fundFamily: row.fund_family,
  category: row.category,
  sectorWeightings: parseJsonArray<SectorWeight>(row.sector_weightings_json),
  regionWeightings: parseJsonArray<RegionWeight>(row.region_weightings_json),
  fetchedAt: row.fetched_at,
  error: row.error,
});

const normalizeWeights = <T>(items: unknown, keyName: 'sector' | 'region'): T[] => {
  if (!Array.isArray(items)) return [];
  const out: T[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const k = obj[keyName];
    const w = obj.weight;
    if (typeof k === 'string' && typeof w === 'number' && Number.isFinite(w)) {
      out.push({ [keyName]: k, weight: w } as T);
    }
  }
  return out;
};

const aggregate = (
  assets: AssetRow[],
  metaByTicker: Map<string, MetadataRow>,
  dimension: string,
  defaultCurrency: string,
) => {
  const buckets = new Map<string, { value: number; ticker?: string }>();
  let unknownValue = 0;
  let totalValue = 0;

  for (const asset of assets) {
    const value = asset.current_value ?? 0;
    totalValue += value;
    const meta = asset.ticker ? metaByTicker.get(asset.ticker) : undefined;

    switch (dimension) {
      case 'currency': {
        const key = asset.original_currency || defaultCurrency;
        if (!key) {
          unknownValue += value;
          break;
        }
        const b = buckets.get(key) ?? { value: 0 };
        b.value += value;
        buckets.set(key, b);
        break;
      }
      case 'holding': {
        const label = asset.name || asset.ticker || asset.external_id;
        if (!label) {
          unknownValue += value;
          break;
        }
        const b = buckets.get(label) ?? { value: 0, ticker: asset.ticker || undefined };
        b.value += value;
        buckets.set(label, b);
        break;
      }
      case 'sector': {
        const weights = meta ? parseJsonArray<SectorWeight>(meta.sector_weightings_json) : [];
        if (weights.length > 0) {
          for (const w of weights) {
            const portion = value * w.weight;
            const b = buckets.get(w.sector) ?? { value: 0 };
            b.value += portion;
            buckets.set(w.sector, b);
          }
        } else if (meta?.sector) {
          const b = buckets.get(meta.sector) ?? { value: 0 };
          b.value += value;
          buckets.set(meta.sector, b);
        } else {
          unknownValue += value;
        }
        break;
      }
      case 'region':
      case 'continent': {
        const weights = meta ? parseJsonArray<RegionWeight>(meta.region_weightings_json) : [];
        if (weights.length > 0) {
          for (const w of weights) {
            const portion = value * w.weight;
            const b = buckets.get(w.region) ?? { value: 0 };
            b.value += portion;
            buckets.set(w.region, b);
          }
        } else if (meta?.country) {
          const b = buckets.get(meta.country) ?? { value: 0 };
          b.value += value;
          buckets.set(meta.country, b);
        } else {
          unknownValue += value;
        }
        break;
      }
      case 'market': {
        const key = meta?.exchange || meta?.country;
        if (!key) {
          unknownValue += value;
          break;
        }
        const b = buckets.get(key) ?? { value: 0 };
        b.value += value;
        buckets.set(key, b);
        break;
      }
      case 'etfProvider': {
        const key = meta?.fund_family;
        if (!key) {
          unknownValue += value;
          break;
        }
        const b = buckets.get(key) ?? { value: 0 };
        b.value += value;
        buckets.set(key, b);
        break;
      }
    }
  }

  const entries = Array.from(buckets.entries())
    .map(([label, b]) => ({
      label,
      value: b.value,
      percentage: totalValue > 0 ? (b.value / totalValue) * 100 : 0,
      color: null as string | null,
      ticker: b.ticker ?? null,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    dimension,
    entries,
    totalValue,
    unknownValue,
  };
};

const getDefaultCurrency = (db: Database, userId: number): string => {
  const row = db
    .prepare('SELECT default_currency FROM net_worth_config WHERE user_id = ?')
    .get(userId) as { default_currency?: string } | undefined;
  return row?.default_currency || 'EUR';
};

export const buildPortfolioBreakdownRouter = (db: Database): Router => {
  const router = Router();

  router.get(
    '/portfolio-breakdown/metadata/:ticker',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const ticker = req.params.ticker;
      if (!ticker) throw apiError(400, 'invalid_param', 'ticker is required');
      const row = db
        .prepare('SELECT * FROM portfolio_metadata_cache WHERE user_id = ? AND ticker = ?')
        .get(userId, ticker) as MetadataRow | undefined;
      if (!row) throw apiError(404, 'not_found', `Metadata for ticker "${ticker}" not found`);
      res.json(mapMetadata(row));
    }),
  );

  router.put(
    '/portfolio-breakdown/metadata/:ticker',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const ticker = req.params.ticker;
      const body = req.body as Record<string, unknown> | undefined;
      if (!ticker) throw apiError(400, 'invalid_param', 'ticker is required');
      if (!body || typeof body !== 'object') throw apiError(400, 'invalid_body', 'Request body must be an object');

      const sectorWeightings = normalizeWeights<SectorWeight>(body.sectorWeightings, 'sector');
      const regionWeightings = normalizeWeights<RegionWeight>(body.regionWeightings, 'region');
      const fetchedAt = typeof body.fetchedAt === 'string' && body.fetchedAt ? body.fetchedAt : nowIso();

      const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

      const params = {
        user_id: userId,
        ticker,
        quote_type: str(body.quoteType),
        long_name: str(body.longName),
        short_name: str(body.shortName),
        currency: str(body.currency),
        exchange: str(body.exchange),
        sector: str(body.sector),
        industry: str(body.industry),
        country: str(body.country),
        fund_family: str(body.fundFamily),
        category: str(body.category),
        sector_weightings_json: sectorWeightings.length ? JSON.stringify(sectorWeightings) : null,
        region_weightings_json: regionWeightings.length ? JSON.stringify(regionWeightings) : null,
        error: str(body.error),
        fetched_at: fetchedAt,
      };

      db.prepare(
        `INSERT INTO portfolio_metadata_cache
           (user_id, ticker, quote_type, long_name, short_name, currency, exchange,
            sector, industry, country, fund_family, category,
            sector_weightings_json, region_weightings_json, error, fetched_at)
         VALUES (@user_id, @ticker, @quote_type, @long_name, @short_name, @currency, @exchange,
                 @sector, @industry, @country, @fund_family, @category,
                 @sector_weightings_json, @region_weightings_json, @error, @fetched_at)
         ON CONFLICT(user_id, ticker) DO UPDATE SET
           quote_type = excluded.quote_type,
           long_name = excluded.long_name,
           short_name = excluded.short_name,
           currency = excluded.currency,
           exchange = excluded.exchange,
           sector = excluded.sector,
           industry = excluded.industry,
           country = excluded.country,
           fund_family = excluded.fund_family,
           category = excluded.category,
           sector_weightings_json = excluded.sector_weightings_json,
           region_weightings_json = excluded.region_weightings_json,
           error = excluded.error,
           fetched_at = excluded.fetched_at`,
      ).run(params);

      const row = db
        .prepare('SELECT * FROM portfolio_metadata_cache WHERE user_id = ? AND ticker = ?')
        .get(userId, ticker) as MetadataRow;
      res.json(mapMetadata(row));
    }),
  );

  router.get(
    '/portfolio-breakdown',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const raw = req.query.dimension;
      const requested = Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [];
      const dimensions: string[] = [];
      for (const d of requested) {
        if (typeof d !== 'string' || !VALID_DIMENSIONS.has(d)) {
          throw apiError(400, 'invalid_param', `Unknown dimension "${String(d)}"`);
        }
        if (!dimensions.includes(d)) dimensions.push(d);
      }
      if (dimensions.length === 0) {
        throw apiError(400, 'invalid_param', 'At least one "dimension" query parameter is required');
      }

      const assets = db
        .prepare(
          `SELECT id, external_id, name, ticker, current_value, original_currency
             FROM assets WHERE user_id = ?`,
        )
        .all(userId) as AssetRow[];

      const tickers = Array.from(new Set(assets.map((a) => a.ticker).filter((t) => t)));
      const metaByTicker = new Map<string, MetadataRow>();
      if (tickers.length > 0) {
        const placeholders = tickers.map(() => '?').join(',');
        const rows = db
          .prepare(
            `SELECT * FROM portfolio_metadata_cache
              WHERE user_id = ? AND ticker IN (${placeholders})`,
          )
          .all(userId, ...tickers) as MetadataRow[];
        for (const row of rows) metaByTicker.set(row.ticker, row);
      }

      const defaultCurrency = getDefaultCurrency(db, userId);
      const results = dimensions.map((d) => aggregate(assets, metaByTicker, d, defaultCurrency));
      res.json(results);
    }),
  );

  return router;
};
