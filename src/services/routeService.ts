const API_BASE = '/api';

export interface CampaignRoute {
  routeId: string;
  zipCode: string;
  crid: string;
  type: string;
  cityState: string;
  residential: number;
  business: number;
  medianIncome: number;
  avgHouseholdSize: number;
  score: number;
  facility: string;
  /** True when the census pass contributed to this route's score. */
  censusEnriched: boolean;
  /** Which variables the score was built from. A score says nothing on its own. */
  scoredOn: string[];
  /** 'USPS' or 'CENSUS_ACS' — USPS leaves these empty in some ZIPs. */
  incomeSource: string;
  sizeSource: string;
  selected: boolean;
}

export interface RoutePlan {
  routes: CampaignRoute[];
  /** Households in the selected routes: the real size of the drop. */
  covered: number;
  selectedRoutes: number;
  available: number;
  availableRoutes: number;
  censusEnriched: boolean;
  target?: number;
  zipCode?: string;
  censusRoutes?: number;
  /** What each variable weighs in the score, straight from the engine. */
  weights: Record<string, number>;
  /** How far household size can move a score, either way. */
  householdSizeNudge: number;
}

function mapPlan(raw: any): RoutePlan {
  return {
    routes: (raw.routes ?? []).map((r: any) => ({
      routeId: r.route_id,
      zipCode: r.zip_code,
      crid: r.crid,
      type: r.type,
      cityState: r.city_state,
      residential: r.residential,
      business: r.business,
      medianIncome: r.median_income,
      avgHouseholdSize: r.avg_household_size,
      score: r.score,
      facility: r.facility,
      censusEnriched: Boolean(r.census_enriched),
      scoredOn: Array.isArray(r.scored_on)
        ? r.scored_on
        : typeof r.scored_on === 'string' && r.scored_on
          ? r.scored_on.split(',').map((s: string) => s.trim()).filter(Boolean)
          : (r.census_enriched ? ['income', 'owner_occupied', 'single_family', 'vehicles', 'home_value', 'household_size'] : []),
      incomeSource: r.income_source ?? '',
      sizeSource: r.size_source ?? '',
      selected: Boolean(r.selected),
    })),
    covered: raw.covered ?? 0,
    selectedRoutes: raw.selected_routes ?? 0,
    available: raw.available ?? 0,
    availableRoutes: raw.available_routes ?? 0,
    censusEnriched: Boolean(raw.census_enriched),
    target: raw.target,
    zipCode: raw.zip_code,
    censusRoutes: raw.census_routes,
    weights: raw.weights ?? {},
    householdSizeNudge: raw.household_size_nudge ?? 0,
  };
}

export async function getCampaignRoutes(campaignId: string): Promise<RoutePlan> {
  const res = await fetch(`${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/routes`);
  if (!res.ok) throw new Error(`GET routes -> ${res.status}`);
  return mapPlan(await res.json());
}

/** Score every route in the ZIP and mark the best ones until the target is met. */
/**
 * The census could not answer, so no plan was made and nothing was written.
 *
 * Carries the reason because the remedy differs: a missing key, a rejected key
 * and an outage each send the operator somewhere else, and an alarm that always
 * says "check your API key" wastes an hour during an outage.
 */
export class CensusUnavailableError extends Error {
  constructor(
    readonly reason: 'NO_KEY' | 'KEY_REJECTED' | 'UNREACHABLE' | 'OK' | 'DISABLED',
    message: string,
  ) {
    super(message);
    this.name = 'CensusUnavailableError';
  }
}

export async function planCampaignRoutes(
  campaignId: string,
  zip: string,
  target: number,
  allowDegraded = false,
): Promise<RoutePlan> {
  const res = await fetch(
    `${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/routes/plan?zip=${encodeURIComponent(zip)}&target=${target}&allow_degraded=${allowDegraded}`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => d.detail)
      .catch(() => '');
    if (res.status === 424 && detail && typeof detail === 'object') {
      throw new CensusUnavailableError(detail.reason, detail.message);
    }
    throw new Error(
      typeof detail === 'string' ? detail : `POST routes/plan -> ${res.status}`,
    );
  }
  return mapPlan(await res.json());
}

export async function toggleCampaignRoute(
  campaignId: string,
  routeId: string,
  selected: boolean,
): Promise<RoutePlan> {
  const res = await fetch(
    `${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/routes/${encodeURIComponent(routeId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected }),
    },
  );
  if (!res.ok) throw new Error(`PATCH route -> ${res.status}`);
  return mapPlan(await res.json());
}

export function campaignRouteManifestUrl(campaignId: string): string {
  return `${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/routes/manifest.csv`;
}

/**
 * What the selected routes are built of, from the county parcel roll.
 *
 * `households` is the USPS delivery count; `parcelsSampled` is how many parcels
 * the ratios were measured from. They differ, and both are shown.
 */
export interface RouteProfile {
  households: number;
  parcelsSampled: number;
  routes: number;
  classBreakdown: { classCode: string; count: number }[];
  singleFamilyRate: number | null;
  medianValue: number | null;
  medianYearBuilt: number | null;
  medianAgeYears: number | null;
  yearBuiltCoverage: number | null;
  source: string;
}

/** Null means the county did not answer — not that the neighbourhood is empty. */
export async function fetchRouteProfile(campaignId: string): Promise<RouteProfile | null> {
  const res = await fetch(
    `${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/routes/profile`,
  );
  if (!res.ok) return null;

  const raw = (await res.json())?.profile;
  if (!raw) return null;

  return {
    households: raw.households ?? 0,
    parcelsSampled: raw.parcels_sampled ?? 0,
    routes: raw.routes ?? 0,
    classBreakdown: (raw.class_breakdown ?? []).map((c: any) => ({
      classCode: c.class_code,
      count: c.count,
    })),
    singleFamilyRate: raw.single_family_rate ?? null,
    medianValue: raw.median_value ?? null,
    medianYearBuilt: raw.median_year_built ?? null,
    medianAgeYears: raw.median_age_years ?? null,
    yearBuiltCoverage: raw.year_built_coverage ?? null,
    source: raw.source ?? '',
  };
}

export interface ReachFloor {
  zipCode: string;
  /** Households on the ZIP's smallest carrier route: the smallest real drop. */
  smallestRoute: number;
  largestRoute: number;
  medianRoute: number;
  routes: number;
  totalHouseholds: number;
}

/**
 * The smallest drop this ZIP can physically take.
 *
 * A carrier walks whole routes. Asking for fewer households than the smallest
 * route does not make a smaller drop, it makes the same drop with a smaller
 * number written next to it.
 */
export async function getReachFloor(zip: string): Promise<ReachFloor> {
  const res = await fetch(`${API_BASE}/eddm/${encodeURIComponent(zip)}/floor`);
  if (!res.ok) throw new Error(`GET /eddm/${zip}/floor -> ${res.status}`);
  const raw = await res.json();
  return {
    zipCode: raw.zip_code,
    smallestRoute: raw.smallest_route,
    largestRoute: raw.largest_route,
    medianRoute: raw.median_route,
    routes: raw.routes,
    totalHouseholds: raw.total_households,
  };
}
