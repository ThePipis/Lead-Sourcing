const API_BASE = '/api';

export interface FilledSlot {
  slot: number;
  business: string;
  phone: string;
  source: string;
  /** How many other candidates were available for this niche. */
  alternatives: number;
}

export interface SkippedSlot {
  slot: number;
  /** `solo_simulados` means real sources had nothing; the box is left empty. */
  reason: string;
}

export interface AutofillResult {
  filled: FilledSlot[];
  skipped: SkippedSlot[];
  message?: string;
}

export interface NextCandidateResult {
  slot: number;
  exhausted: boolean;
  business: string | null;
  phone?: string;
  source?: string;
  detail?: string;
}

/** Put a real business in every empty box, in one pass. */
export async function autofillSlots(
  campaignId: string,
  mockMode: boolean,
): Promise<AutofillResult> {
  const res = await fetch(
    `${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/slots/autofill?mock_mode=${mockMode}`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => d.detail)
      .catch(() => '');
    throw new Error(detail || `POST autofill -> ${res.status}`);
  }
  return await res.json();
}

/**
 * Swap the business in one box for the next candidate. `rejected` marks the
 * current one as a "no" so it never comes back for this campaign.
 */
export async function nextCandidate(
  campaignId: string,
  slotNumber: number,
  mockMode: boolean,
  rejected = true,
): Promise<NextCandidateResult> {
  const res = await fetch(
    `${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/slots/${slotNumber}/next-candidate?mock_mode=${mockMode}&rejected=${rejected}`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => d.detail)
      .catch(() => '');
    throw new Error(detail || `POST next-candidate -> ${res.status}`);
  }
  return await res.json();
}

/**
 * Stamp every unpaid box as collected. Practice file only — the backend refuses
 * it in the live world, where a payment has to match money that arrived.
 */
export async function markAllPaid(
  campaignId: string,
): Promise<{ stamped: number[]; collected: number }> {
  const res = await fetch(
    `${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/slots/mark-all-paid`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => d.detail)
      .catch(() => '');
    throw new Error(detail || `POST mark-all-paid -> ${res.status}`);
  }
  return await res.json();
}
