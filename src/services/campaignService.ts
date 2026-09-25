import { Campaign, SlotState, SlotStatus, Household, CurationSummary } from '../types.ts';
import { CLOSED_CATEGORIES } from '../data/categories.ts';

const API_BASE = '/api';

/**
 * Maps a backend SlotResponse (snake_case) to frontend SlotState (camelCase)
 */
export function mapBackendSlotToFrontend(raw: any): SlotState {
  const slotNum = raw.slot_number ?? raw.slotNumber;
  const catDef = CLOSED_CATEGORIES.find((c) => c.id === slotNum);

  return {
    slotNumber: slotNum,
    categoryId: raw.category_id ?? raw.categoryId ?? slotNum,
    categoryName: raw.category_name ?? raw.categoryName ?? undefined,
    businessName: raw.business_name ?? raw.businessName ?? '',
    contactPerson: raw.contact_person ?? raw.contactPerson ?? '',
    phone: raw.phone ?? '',
    email: raw.email ?? '',
    website: raw.website ?? '',
    businessAddress: raw.business_address ?? raw.businessAddress ?? '',
    status: (raw.status as SlotStatus) || 'VACANT',
    priceUsd: raw.price_usd ?? raw.priceUsd ?? (catDef ? catDef.priceUsd : 497),
    avgTicketUsd: raw.avg_ticket_usd ?? raw.avgTicketUsd ?? (catDef ? catDef.avgTicketUsd : 450),
    logoUrl: raw.logo_url ?? raw.logoUrl ?? '',
    offerHeadline:
      raw.offer_headline ?? raw.offerHeadline ?? (catDef ? catDef.defaultHeadline : ''),
    qrCodeUrl: raw.qr_code_url ?? raw.qrCodeUrl ?? '',
    qrRedirectUrl: raw.short_url ?? raw.qrRedirectUrl ?? '',
    scanCount: raw.scan_count ?? raw.scanCount ?? 0,
    paymentRef: raw.payment_ref ?? raw.paymentRef ?? '',
    paidAt: raw.paid_at ?? raw.paidAt ?? undefined,
    amountCollectedUsd: raw.amount_collected_usd ?? raw.amountCollectedUsd ?? undefined,
    notes: raw.notes ?? undefined,
    format: raw.format ?? undefined,
    side: raw.side ?? undefined,
    gridRow: raw.grid_row ?? raw.gridRow ?? undefined,
    gridCol: raw.grid_col ?? raw.gridCol ?? undefined,
    rowSpan: raw.row_span ?? raw.rowSpan ?? undefined,
    colSpan: raw.col_span ?? raw.colSpan ?? undefined,
    reservedAt: raw.reserved_at ?? raw.reservedAt ?? undefined,
    reservationExpiresAt: raw.reservation_expires_at ?? raw.reservationExpiresAt ?? undefined,
  };
}

/**
 * Maps frontend SlotState updates to backend payload (snake_case + camelCase friendly)
 */
export function mapFrontendSlotToBackend(data: Partial<SlotState>): Record<string, any> {
  const payload: Record<string, any> = {};

  if (data.categoryId !== undefined) payload.category_id = data.categoryId;
  if (data.categoryName !== undefined) payload.category_name = data.categoryName;
  if (data.status !== undefined) payload.status = data.status;
  if (data.businessName !== undefined) payload.business_name = data.businessName;
  if (data.offerHeadline !== undefined) payload.offer_headline = data.offerHeadline;
  if (data.logoUrl !== undefined) payload.logo_url = data.logoUrl;
  if (data.contactPerson !== undefined) payload.contact_person = data.contactPerson;
  if (data.phone !== undefined) payload.phone = data.phone;
  if (data.email !== undefined) payload.email = data.email;
  if (data.website !== undefined) payload.website = data.website;
  if (data.businessAddress !== undefined) payload.business_address = data.businessAddress;
  if (data.paymentRef !== undefined) payload.payment_ref = data.paymentRef;
  if (data.scanCount !== undefined) payload.scan_count = data.scanCount;
  if (data.paidAt !== undefined) payload.paid_at = data.paidAt;
  if (data.amountCollectedUsd !== undefined) payload.amount_collected_usd = data.amountCollectedUsd;
  if (data.priceUsd !== undefined) payload.price_usd = data.priceUsd;
  if (data.avgTicketUsd !== undefined) payload.avg_ticket_usd = data.avgTicketUsd;
  if (data.notes !== undefined) payload.notes = data.notes;
  if (data.format !== undefined) payload.format = data.format;
  if (data.side !== undefined) payload.side = data.side;
  if (data.gridRow !== undefined) payload.grid_row = data.gridRow;
  if (data.gridCol !== undefined) payload.grid_col = data.gridCol;
  if (data.rowSpan !== undefined) payload.row_span = data.rowSpan;
  if (data.colSpan !== undefined) payload.col_span = data.colSpan;
  if (data.reservedAt !== undefined) payload.reserved_at = data.reservedAt;
  if (data.reservationExpiresAt !== undefined) payload.reservation_expires_at = data.reservationExpiresAt;

  return payload;
}

/**
 * Maps a backend CampaignResponse to frontend Campaign
 */
export function mapBackendCampaignToFrontend(raw: any): Campaign {
  const slots: SlotState[] = (raw.slots || [])
    .map(mapBackendSlotToFrontend)
    .sort((a: SlotState, b: SlotState) => a.slotNumber - b.slotNumber);

  const paidSlots = slots.filter((s) => s.status === 'PAID');
  const paidCount = raw.paid_count ?? paidSlots.length;
  const totalCollectedUsd =
    raw.total_collected_usd ?? paidSlots.reduce((acc, s) => acc + s.priceUsd, 0);
  const calculatedGrossRevenue = slots.reduce((acc, s) => acc + s.priceUsd, 0);
  const targetGrossRevenue = raw.target_gross_revenue ?? calculatedGrossRevenue;
  const unitCostUsd = raw.unit_cost_usd ?? raw.unitCostUsd ?? 0.6;
  const fixedCostUsd = raw.fixed_cost_usd ?? raw.fixedCostUsd ?? 0;
  const targetMargin = raw.target_margin ?? raw.targetMargin ?? 0.58;
  const targetHouseholds = raw.target_households ?? raw.totalTargetHouseholds ?? 5000;
  // Cost follows the drop size rather than a flat $3,000.
  const operatingCostEst =
    raw.operating_cost_est ?? Math.round(targetHouseholds * unitCostUsd + fixedCostUsd);
  const netMarginEst = raw.net_margin_est ?? Math.max(0, targetGrossRevenue - operatingCostEst);

  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    targetCity: raw.target_city ?? raw.targetCity ?? 'Eastvale',
    targetZip: raw.target_zip ?? raw.targetZip ?? '92880',
    radiusMiles: raw.radius_miles ?? raw.radiusMiles ?? 5.0,
    totalTargetHouseholds: targetHouseholds,
    unitCostUsd,
    fixedCostUsd,
    targetMargin,
    targetGrossRevenue,
    operatingCostEst,
    netMarginEst,
    status: raw.status || (paidCount === 14 ? 'LOCKED_READY' : 'PROSPECTING'),
    slots,
    paidCount,
    totalCollectedUsd,
    mode: (raw.mode ?? 'DEMO') as Campaign['mode'],
    curatedCount: raw.curated_count ?? raw.curatedCount ?? 0,
    productionAt: raw.production_at ?? raw.productionAt ?? undefined,
    mailedAt: raw.mailed_at ?? raw.mailedAt ?? undefined,
    archivedAt: raw.archived_at ?? raw.archivedAt ?? undefined,
    coveredHouseholds: raw.covered_households ?? raw.coveredHouseholds ?? 0,
    selectedRoutes: raw.selected_routes ?? raw.selectedRoutes ?? 0,
  };
}

/**
 * GET /api/campaigns
 * Every campaign in the file, newest first, with slot and curation progress.
 */
export async function listCampaigns(mode: 'DEMO' | 'LIVE'): Promise<Campaign[]> {
  const response = await fetch(`${API_BASE}/campaigns?mode=${mode}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to list campaigns: HTTP ${response.status}`);
  }

  const data = await response.json();
  return (data as any[]).map(mapBackendCampaignToFrontend);
}

/**
 * POST /api/campaigns
 * Opens a new form for a microzone and seeds its fourteen slots.
 */
export async function createCampaign(
  city: string,
  zip: string,
  mode: 'DEMO' | 'LIVE',
  targetHouseholds: number,
): Promise<Campaign> {
  const response = await fetch(`${API_BASE}/campaigns/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      name: `Co-Op Direct Mail - ${city}`,
      target_city: city,
      target_zip: zip,
      radius_miles: 5.0,
      mode,
      target_households: targetHouseholds,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      response.status === 409
        ? `CONFLICT:${detail}`
        : `Failed to create campaign: HTTP ${response.status}`,
    );
  }

  return mapBackendCampaignToFrontend(await response.json());
}

/**
 * PATCH /api/campaigns/{id}
 * Advances a campaign into production or marks the drop mailed. The backend
 * stamps production_at / mailed_at the first time each transition happens.
 */
export async function updateCampaignStatus(
  campaignId: string,
  status: Campaign['status'],
): Promise<Campaign> {
  return patchCampaign(campaignId, { status });
}

/**
 * Resize the drop. Refused by the backend once any slot is paid, because the
 * advertiser bought a stated reach.
 */
export async function resizeCampaign(
  campaignId: string,
  targetHouseholds: number,
): Promise<Campaign> {
  return patchCampaign(campaignId, { target_households: targetHouseholds });
}

/**
 * Put every niche back in the box it was designed for. Businesses travel with
 * their niche, so this restores the arrangement without losing anybody.
 *
 * With `wipe`, it goes further and empties every box — a blank card, as on day
 * one. The backend refuses that outside the practice file.
 */
export async function resetSlotLayout(campaignId: string, wipe = false): Promise<Campaign> {
  const response = await fetch(
    `${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/reset-slots?wipe=${wipe}`,
    { method: 'POST', headers: { Accept: 'application/json' } },
  );
  if (!response.ok) throw new Error(`Failed to reset slots: HTTP ${response.status}`);
  return mapBackendCampaignToFrontend(await response.json());
}

/**
 * File a campaign away, or bring it back. Nothing is lost either way: the
 * campaign keeps its slots, its money and its audience, it just stops
 * competing for attention in the drawer.
 */
export async function setCampaignArchived(
  campaignId: string,
  archived: boolean,
): Promise<Campaign> {
  return patchCampaign(campaignId, { archived });
}

/**
 * Destroy a campaign for good.
 *
 * The backend refuses this for a LIVE campaign that already holds work — money
 * collected, an audience cut, a drop at the printer — because that is a
 * business record, not clutter. A 409 comes back as CONFLICT: for the caller to
 * explain in words.
 */
export async function deleteCampaign(campaignId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/campaigns/${encodeURIComponent(campaignId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      response.status === 409
        ? `CONFLICT:${detail}`
        : `Failed to delete campaign: HTTP ${response.status}`,
    );
  }
}

async function patchCampaign(campaignId: string, body: Record<string, unknown>): Promise<Campaign> {
  const response = await fetch(`${API_BASE}/campaigns/${encodeURIComponent(campaignId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      response.status === 409
        ? `CONFLICT:${detail}`
        : `Failed to update campaign: HTTP ${response.status}`,
    );
  }

  return mapBackendCampaignToFrontend(await response.json());
}

/**
 * GET /api/campaigns/active
 * Retrieves or initializes the active campaign and its 14 slots in SQLite.
 * Accepts optional zipCode parameter to switch microzones dynamically.
 */
export async function getActiveCampaign(zipCode?: string): Promise<Campaign> {
  const url = zipCode
    ? `${API_BASE}/campaigns/active?zip_code=${encodeURIComponent(zipCode)}`
    : `${API_BASE}/campaigns/active`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load active campaign: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return mapBackendCampaignToFrontend(data);
}

/**
 * PUT /api/campaigns/{id}/slots/{slot_id}
 * Updates a single slot in SQLite.
 */
export async function updateCampaignSlot(
  campaignId: string,
  slotNumber: number,
  data: Partial<SlotState>,
): Promise<SlotState> {
  const payload = mapFrontendSlotToBackend(data);

  const response = await fetch(
    `${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/slots/${slotNumber}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to update slot ${slotNumber}: HTTP ${response.status}`);
  }

  const result = await response.json();
  return mapBackendSlotToFrontend(result);
}

/**
 * PUT /api/campaigns/{id}/batch-slots
 * Updates multiple slots in a single atomic SQLite transaction.
 */
export async function batchUpdateCampaignSlots(
  campaignId: string,
  updates: Array<Partial<SlotState> & { slotNumber: number }>,
): Promise<SlotState[]> {
  const payload = updates.map((u) => ({
    slot_number: u.slotNumber,
    ...mapFrontendSlotToBackend(u),
  }));

  const response = await fetch(
    `${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/batch-slots`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to batch update slots: HTTP ${response.status}`);
  }

  const result = await response.json();
  return (result as any[]).map(mapBackendSlotToFrontend);
}

/**
 * POST /api/curation/execute
 * Invokes the backend algorithmic propensity curation engine atomically,
 * persists the top 5,000 households into SQLite and returns the summary and records.
 */
export async function executeBackendCuration(
  campaignId: string,
  weights?: number[][],
  targetCount = 5000,
  mockMode = true,
): Promise<{ summary: CurationSummary; top_5k: Household[] }> {
  const response = await fetch(`${API_BASE}/curation/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      campaign_id: campaignId,
      target_count: targetCount,
      mock_mode: mockMode,
      synthetic_pool_size: 15000,
      weights: weights,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Curation execution failed: HTTP ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data;
}
