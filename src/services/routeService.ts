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
  };
}

export async function getCampaignRoutes(campaignId: string): Promise<RoutePlan> {
  const res = await fetch(`${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/routes`);
  if (!res.ok) throw new Error(`GET routes -> ${res.status}`);
  return mapPlan(await res.json());
}

/** Score every route in the ZIP and mark the best ones until the target is met. */
export async function planCampaignRoutes(
  campaignId: string,
  zip: string,
  target: number,
): Promise<RoutePlan> {
  const res = await fetch(
    `${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/routes/plan?zip=${encodeURIComponent(zip)}&target=${target}`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => d.detail)
      .catch(() => '');
    throw new Error(detail || `POST routes/plan -> ${res.status}`);
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
