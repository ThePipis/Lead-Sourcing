import { AppMode } from '../hooks/useAppMode.ts';

const API_BASE = '/api';

export interface DataSource {
  id: string;
  name: string;
  /** FREE costs nothing to call; PAID bills per call or per contract. */
  cost: 'FREE' | 'PAID';
  url?: string;
  /** What kind of data it returns: routes, demographics, businesses, households. */
  provides: string;
  gives: string;
  lacks: string;
  note: string;
  enabled: boolean;
  envKey?: string;
  /** True when its key is present in backend/.env and is not a placeholder. */
  configured: boolean;
}

export interface MarketLine {
  id: string;
  label: string;
  low: number;
  high: number;
  suggested: number;
  basis: string;
  source: string;
}

export interface MarketReference {
  updated: string;
  lines: MarketLine[];
  dataAxlePlans: { plan: string; monthly: number; annualCommitment: number }[];
  dataAxleNote: string;
}

export interface SourceTest {
  source: string;
  ok: boolean;
  configured: boolean;
  detail: string;
  sample: unknown[];
}

function mapSource(raw: any): DataSource {
  return {
    id: raw.id,
    name: raw.name,
    cost: raw.cost,
    url: raw.url ?? undefined,
    provides: raw.provides,
    gives: raw.gives,
    lacks: raw.lacks,
    note: raw.note,
    enabled: Boolean(raw.enabled),
    envKey: raw.env_key ?? undefined,
    configured: Boolean(raw.configured),
  };
}

export async function listDataSources(mode: AppMode): Promise<DataSource[]> {
  const res = await fetch(`${API_BASE}/datasources/${mode}`);
  if (!res.ok) throw new Error(`GET /datasources/${mode} -> ${res.status}`);
  return (await res.json()).map(mapSource);
}

export async function setDataSourceEnabled(
  mode: AppMode,
  sourceId: string,
  enabled: boolean,
): Promise<DataSource> {
  const res = await fetch(`${API_BASE}/datasources/${mode}/${sourceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`PUT /datasources/${mode}/${sourceId} -> ${res.status}`);
  return mapSource(await res.json());
}

export async function getMarketReference(): Promise<MarketReference> {
  const res = await fetch(`${API_BASE}/datasources/reference/market`);
  if (!res.ok) throw new Error(`GET market reference -> ${res.status}`);
  const raw = await res.json();
  return {
    updated: raw.updated,
    lines: raw.lines ?? [],
    dataAxlePlans: (raw.data_axle_plans ?? []).map((p: any) => ({
      plan: p.plan,
      monthly: p.monthly,
      annualCommitment: p.annual_commitment,
    })),
    dataAxleNote: raw.data_axle_note ?? '',
  };
}

/** Smallest request that proves a source answers: five records, not five thousand. */
export async function testDataSource(sourceId: string, limit = 5): Promise<SourceTest> {
  const res = await fetch(`${API_BASE}/datasources/test/${sourceId}?limit=${limit}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`POST /datasources/test/${sourceId} -> ${res.status}`);
  return await res.json();
}

/** Load the published market rates over this mode's cost model. */
export async function applyMarketPreset(mode: AppMode, households: number): Promise<void> {
  const res = await fetch(`${API_BASE}/costs/${mode}/market-preset?households=${households}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`POST /costs/${mode}/market-preset -> ${res.status}`);
}

export interface EddmRoute {
  routeId: string;
  crid: string;
  cityState: string;
  residential: number;
  business: number;
  medianIncome: number;
  avgHouseholdSize: number;
  facility: string;
  score: number;
  selected: boolean;
  /** Which variables the score actually rested on. */
  scoredOn: string[];
}

export interface EddmSelection {
  zipCode: string;
  target: number;
  /** Households actually covered: whole routes, so it overshoots the target. */
  covered: number;
  routeCount: number;
  cutoffScore: number;
  available: number;
  availableRoutes: number;
  /** False when the Census key is missing and only USPS variables were used. */
  censusEnriched: boolean;
  routes: EddmRoute[];
}

export async function getEddmRoutes(zip: string, target: number): Promise<EddmSelection> {
  const res = await fetch(`${API_BASE}/eddm/${encodeURIComponent(zip)}/routes?target=${target}`);
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => d.detail)
      .catch(() => '');
    throw new Error(detail || `GET /eddm/${zip}/routes -> ${res.status}`);
  }
  const raw = await res.json();
  return {
    zipCode: raw.zip_code,
    target: raw.target,
    covered: raw.covered,
    routeCount: raw.route_count,
    cutoffScore: raw.cutoff_score,
    available: raw.available,
    availableRoutes: raw.available_routes,
    censusEnriched: Boolean(raw.census_enriched),
    routes: (raw.routes ?? []).map((r: any) => ({
      routeId: r.route_id,
      crid: r.crid,
      cityState: r.city_state,
      residential: r.residential,
      business: r.business,
      medianIncome: r.median_income,
      avgHouseholdSize: r.avg_household_size,
      facility: r.facility,
      score: r.score,
      selected: Boolean(r.selected),
      scoredOn: r.scored_on ?? [],
    })),
  };
}

export function eddmManifestUrl(zip: string, target: number): string {
  return `${API_BASE}/eddm/${encodeURIComponent(zip)}/manifest.csv?target=${target}`;
}
