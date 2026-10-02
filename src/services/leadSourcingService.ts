import { LeadProspect } from '../types.ts';
import { CLOSED_CATEGORIES } from '../data/categories.ts';






/**
 * The business's own site, or nothing.
 *
 * This used to guess `https://www.{name-without-spaces}.com` whenever the
 * source had no site. That is how `piccoaircontrol.com` — a domain that does
 * not resolve — reached a prospect card and got clicked in front of the owner.
 * A missing website is a fact about the business. It is not ours to invent.
 */
export function getRealWebsiteUrl(lead: { websiteUrl?: string }): string {
  const raw = (lead.websiteUrl || '').trim();
  if (!raw || raw.includes('yelp.com') || raw.includes('yellowpages.com')) {
    return '';
  }
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/**
 * The business's email, or nothing.
 *
 * `contact@{slug}.com` was invented for every lead that had none. It bounces,
 * and it bounces after the partner has already used it.
 */
export function getLeadEmail(lead: { email?: string }): string {
  const raw = (lead.email || '').trim();
  return raw.includes('@') ? raw : '';
}

/**
 * Where the business is, as far as anyone actually knows.
 *
 * A trade worked out of a van has no street address, and Yelp returns an empty
 * one. Gluing the city fragments together produced "Corona, CA 92880, Eastvale
 * (92880)" — a string that reads like an address, is not one, and sends Google
 * Maps to a pin in the desert. When there is no street, say so.
 */
export function getFullAddress(lead: {
  address?: string;
  city?: string;
  zip?: string;
  zipCode?: string;
  hasStreetAddress?: boolean;
}): string {
  const addr = (lead.address || '').trim();
  const city = (lead.city || '').trim();
  const zip = (lead.zip || lead.zipCode || '').trim();

  if (lead.hasStreetAddress === false || !addr) {
    return city || zip || '';
  }

  const parts: string[] = [addr];
  if (city && !addr.toLowerCase().includes(city.toLowerCase())) parts.push(city);
  if (zip && !addr.includes(zip)) parts.push(zip.startsWith('CA') ? zip : `CA ${zip}`);
  return parts.join(', ');
}

/**
 * The map link. Coordinates when there is no street, because those are what put
 * the business in the microzone in the first place — searching Maps for a city
 * name and a business that has no address lands nowhere useful.
 */
export function getMapUrl(lead: {
  businessName?: string;
  address?: string;
  city?: string;
  zip?: string;
  zipCode?: string;
  hasStreetAddress?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}): string {
  const base = 'https://www.google.com/maps/search/?api=1&query=';
  if (lead.hasStreetAddress === false && lead.latitude != null && lead.longitude != null) {
    return `${base}${lead.latitude},${lead.longitude}`;
  }
  const where = getFullAddress(lead);
  return `${base}${encodeURIComponent(`${lead.businessName ?? ''} ${where}`.trim())}`;
}


/**
 * Searches for top 3 candidates per category across Yelp Fusion and Geoapify Places,
 * filters by rating >= 4.0 and reviewCount >= 15, and provides bilingual LLM sales hooks.
 */
export async function searchCategoryLeads(
  targetCity = 'Eastvale',
  targetZip = '92880',
  categoryId?: number,
  excludeNames: string[] = [],
  campaignId?: string,
): Promise<LeadProspect[]> {
  const allExcluded = Array.from(
    new Set([
      ...excludeNames.map((n) => n.trim().toLowerCase()),
    ]),
  );

  try {
    const params = new URLSearchParams({
      city: targetCity,
      zip_code: targetZip,
    });
    if (categoryId) {
      params.append('category_id', String(categoryId));
    }
    if (allExcluded.length > 0) {
      params.append('exclude_names', allExcluded.join(','));
    }

    const resp = await fetch(`/api/prospecting/search?${params.toString()}`);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        const mapped: LeadProspect[] = data.map((item: any) => {
          const rawBizName = item.name || item.business_name || '';
          const bLead = {
            businessName: rawBizName,
            websiteUrl: item.website_url || item.websiteUrl,
            email: item.email,
          };
          return {
            id: item.id,
            categoryId: item.category_id,
            businessName: rawBizName,
            name: rawBizName,
            categoryName: item.category_name,
            category: item.category,
            address: item.address || '',
            city: item.city || targetCity,
            zip: item.zip_code || item.zip || targetZip,
            zipCode: item.zip_code || item.zip || targetZip,
            phone: item.phone || '',
            email: getLeadEmail(bLead),
            websiteOk: item.website_ok ?? null,
          websiteSource: item.website_source ?? null,
          hasStreetAddress: item.has_street_address !== false,
          latitude: item.latitude ?? null,
          longitude: item.longitude ?? null,
          simulated: Boolean(item.simulated),
          rating: item.rating ?? undefined,
            reviewCount: item.review_count ?? undefined,
            websiteUrl: getRealWebsiteUrl(bLead),
            source: item.source || 'Yelp Fusion',
            decisionMaker: item.decision_maker || 'Owner / Decision Maker',
            decisionMakerTitle: item.decision_maker_title || 'Owner / Decision Maker',
            avgTicketEstimated: item.avg_ticket_estimated || 500,
            distanceMiles: item.distance_miles ?? item.distanceMiles ?? (item.distance_m ? Math.round((item.distance_m / 1609.344) * 10) / 10 : undefined),
            distance_miles: item.distance_miles ?? item.distanceMiles,
            geoTier: item.geo_tier,
            status: item.status || 'NEW',
          };
        });

        return mapped.filter((l) => !allExcluded.includes(l.businessName.toLowerCase()));
      }
    }
  } catch (err) {
    console.warn('[LeadSourcing] Backend query failed, using client seed database:', err);
  }

  // Same rule: an empty list, never an invented one. The source alarm in the
  // canvas names what failed.
  const results: LeadProspect[] = [];
  return results;
}

/**
 * Busca un único candidato calificado de reemplazo que no esté en la lista negra
 * ni en la lista actual de prospectos.
 */
export async function fetchReplacementLead(
  categoryId: number,
  targetCity = 'Eastvale',
  targetZip = '92880',
  excludedNames: string[] = [],
  campaignId?: string,
): Promise<LeadProspect | null> {
  const allExcluded = Array.from(
    new Set([
      ...excludedNames.map((n) => n.trim().toLowerCase()),
    ]),
  );

  try {
    const params = new URLSearchParams({
      category_id: String(categoryId),
      city: targetCity,
      zip_code: targetZip,
    });
    if (allExcluded.length > 0) {
      params.append('exclude_names', allExcluded.join(','));
    }

    // `/prospecting/replace` never existed: this call had been answering 404
    // since it was written, so "regenerate" silently did nothing. The search
    // endpoint already takes the exclusions; the first row it returns is the
    // replacement.
    const resp = await fetch(`/api/prospecting/search?${params.toString()}`);
    if (resp.ok) {
      const rows = await resp.json();
      const item = Array.isArray(rows) ? rows[0] : rows;
      if (item && item.business_name) {
        const rawBizName = item.name || item.business_name || '';
        const bLead = {
          businessName: rawBizName,
          websiteUrl: item.website_url || item.websiteUrl,
          email: item.email,
        };
        return {
          id: item.id,
          categoryId: item.category_id,
          businessName: rawBizName,
          name: rawBizName,
          categoryName: item.category_name,
          category: item.category,
          address: item.address || '',
          city: item.city || targetCity,
          zip: item.zip_code || item.zip || targetZip,
          zipCode: item.zip_code || item.zip || targetZip,
          phone: item.phone || '',
          email: getLeadEmail(bLead),
          websiteOk: item.website_ok ?? null,
          websiteSource: item.website_source ?? null,
          hasStreetAddress: item.has_street_address !== false,
          latitude: item.latitude ?? null,
          longitude: item.longitude ?? null,
          simulated: Boolean(item.simulated),
          rating: item.rating ?? undefined,
          reviewCount: item.review_count ?? undefined,
          websiteUrl: getRealWebsiteUrl(bLead),
          source: item.source || 'Yelp Fusion',
          decisionMaker: item.decision_maker || 'Owner / Decision Maker',
          decisionMakerTitle: item.decision_maker_title || 'Owner / Decision Maker',
          avgTicketEstimated: item.avg_ticket_estimated || 500,
          distanceMiles: item.distance_miles ?? item.distanceMiles ?? (item.distance_m ? Math.round((item.distance_m / 1609.344) * 10) / 10 : undefined),
          distance_miles: item.distance_miles ?? item.distanceMiles,
          geoTier: item.geo_tier,
          status: 'NEW',
        };
      }
    }
  } catch (err) {
    console.warn('[LeadSourcing] Backend replacement query failed, using seed pool:', err);
  }

  // No local invention. When the backend cannot answer, the caller gets null
  // and the screen says which source failed — a made-up business looks exactly
  // like a real one until somebody dials it.
  return null;
}

/**
 * PATCH /api/prospecting/leads/{id}
 * Persists the CRM status the operator sets. Without this the status lives
 * only in component state and dies on the next refetch.
 */
export async function updateLeadStatus(
  leadId: string,
  status: LeadProspect['status'],
): Promise<void> {
  const response = await fetch(
    `/api/prospecting/leads/${encodeURIComponent(leadId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ status }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to persist lead status: HTTP ${response.status}`);
  }
}

export interface RegenerationReason {
  code: string;
  label: string;
  /** How long it rests. null means permanent (the business is gone). */
  cooldown_days: number | null;
}

export interface ContactOutcome {
  code: string;
  label: string;
  follow_up_days: number;
}

export interface ContactRecord {
  count: number;
  last: {
    outcome_code: string;
    outcome_label: string;
    note: string | null;
    at: string | null;
    follow_up_at: string | null;
    /** True once the promised day arrived. The card blinks on this. */
    due: boolean;
  } | null;
}

export interface QuarantinedBusiness {
  business_key: string;
  business_name: string;
  address: string;
  reason_label: string;
  reason_note: string | null;
  cooldown_until: string | null;
}

export interface RegenerationRecord {
  count: number;
  last: {
    reason_code: string;
    reason_label: string;
    reason_note: string | null;
    at: string | null;
    /** When it comes back into the pool on its own. */
    cooldown_until?: string | null;
    /** True while the clock is still running. */
    resting?: boolean;
  } | null;
}

export async function fetchRegenerationReasons(): Promise<RegenerationReason[]> {
  try {
    const r = await fetch('/api/prospecting/regeneration-reasons');
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

/**
 * How often each of these businesses has been set aside, and why, last time.
 *
 * Asked once for the whole visible list: three cards, one request.
 */
export async function fetchRegenerations(
  names: string[],
): Promise<Record<string, RegenerationRecord>> {
  const clean = names.map((n) => (n || '').trim()).filter(Boolean);
  if (clean.length === 0) return {};
  try {
    const r = await fetch(
      `/api/prospecting/regenerations?names=${encodeURIComponent(clean.join('|'))}`,
    );
    return r.ok ? await r.json() : {};
  } catch {
    return {};
  }
}

/** Write down that a business was set aside, and why. Never a blacklist. */
export async function recordRegeneration(input: {
  businessName: string;
  campaignId?: string;
  categoryId?: number;
  slotNumber?: number;
  reasonCode: string;
  reasonNote?: string;
  businessAddress?: string;
  cooldownDays?: number;
}): Promise<RegenerationRecord['last'] & { count: number }> {
  const r = await fetch('/api/prospecting/regenerations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_name: input.businessName,
      campaign_id: input.campaignId,
      category_id: input.categoryId,
      slot_number: input.slotNumber,
      reason_code: input.reasonCode,
      reason_note: input.reasonNote,
      business_address: input.businessAddress,
      cooldown_days: input.cooldownDays,
    }),
  });
  if (!r.ok) throw new Error(`POST regenerations -> ${r.status}`);
  return await r.json();
}

/** The normalised key the backend groups regenerations by. */
export function businessKey(name: string): string {
  return (name || '').trim().toLowerCase().split(/\s+/).join(' ');
}

export async function fetchContactOutcomes(): Promise<ContactOutcome[]> {
  try {
    const r = await fetch('/api/prospecting/contact-outcomes');
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

/** Last call per business, for the cards about to be drawn. One request. */
export async function fetchContacts(names: string[]): Promise<Record<string, ContactRecord>> {
  const clean = names.map((n) => (n || '').trim()).filter(Boolean);
  if (clean.length === 0) return {};
  try {
    const r = await fetch(
      `/api/prospecting/contacts?names=${encodeURIComponent(clean.join('|'))}`,
    );
    return r.ok ? await r.json() : {};
  } catch {
    return {};
  }
}

/** One conversation inside a box: who, how it went, how long ago. */
export interface SlotCall {
  business_name: string;
  count: number;
  outcome_code: string;
  outcome_label: string;
  note: string | null;
  at: string | null;
  follow_up_at: string | null;
  due: boolean;
}

export interface CallFollowUpStatus {
  isScheduledFuture: boolean;
  isDue: boolean;
  isOverdue1h: boolean;
  badgeText: string;     // e.g. "llamar en 2 min", "sin insistir hace 1 min", "sin insistir ahora", "hace 5 min"
  overdueSince: string;  // e.g. "hace 1 min", "ahora", "hace 2 h"
  callElapsed: string;   // e.g. "hace 5 min"
}

function parseIso(iso: string | null): number | null {
  if (!iso) return null;
  const s = iso.endsWith('Z') ? iso : iso + 'Z';
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

export function getCallFollowUpStatus(
  at: string | null,
  followUpAt: string | null,
  nowMs: number = Date.now()
): CallFollowUpStatus {
  const atTime = parseIso(at);
  const targetTime = parseIso(followUpAt);

  let callElapsed = '';
  let elapsedMins = 0;
  if (atTime) {
    elapsedMins = Math.max(0, Math.floor((nowMs - atTime) / 60000));
    if (elapsedMins < 60) {
      callElapsed = `hace ${elapsedMins} min`;
    } else if (elapsedMins < 1440) {
      callElapsed = `hace ${Math.floor(elapsedMins / 60)} h`;
    } else {
      const d = Math.floor(elapsedMins / 1440);
      callElapsed = d === 1 ? 'hace 1 día' : `hace ${d} días`;
    }
  }

  // If no follow-up scheduled, it's just the elapsed time of the call
  if (!targetTime) {
    return {
      isScheduledFuture: false,
      isDue: false,
      isOverdue1h: elapsedMins >= 60,
      badgeText: callElapsed,
      overdueSince: callElapsed,
      callElapsed,
    };
  }

  const diffMs = targetTime - nowMs;

  // Case 1: Future scheduled call (countdown)
  if (diffMs > 0) {
    const minsRemaining = Math.max(1, Math.ceil(diffMs / 60000));
    let timeRemaining = '';
    if (minsRemaining < 60) {
      timeRemaining = `en ${minsRemaining} min`;
    } else if (minsRemaining < 1440) {
      const h = Math.floor(minsRemaining / 60);
      const m = minsRemaining % 60;
      timeRemaining = m > 0 ? `en ${h} h ${m} m` : `en ${h} h`;
    } else {
      const d = Math.floor(minsRemaining / 1440);
      timeRemaining = d === 1 ? 'mañana' : `en ${d} días`;
    }

    return {
      isScheduledFuture: true,
      isDue: false,
      isOverdue1h: false,
      badgeText: `llamar ${timeRemaining}`,
      overdueSince: '',
      callElapsed,
    };
  }

  // Case 2: Due / Overdue (countdown reached 0 and past)
  const overdueMs = nowMs - targetTime;
  const overdueMins = Math.floor(overdueMs / 60000);

  let overdueSince = '';
  let badgeText = '';

  if (overdueMins < 1) {
    overdueSince = 'ahora';
    badgeText = 'sin insistir ahora';
  } else if (overdueMins < 60) {
    overdueSince = `hace ${overdueMins} min`;
    badgeText = `sin insistir hace ${overdueMins} min`;
  } else if (overdueMins < 1440) {
    const h = Math.floor(overdueMins / 60);
    overdueSince = `hace ${h} h`;
    badgeText = `sin insistir hace ${h} h`;
  } else {
    const d = Math.floor(overdueMins / 1440);
    overdueSince = d === 1 ? 'hace 1 día' : `hace ${d} días`;
    badgeText = d === 1 ? 'sin insistir hace 1 día' : `sin insistir hace ${d} días`;
  }

  return {
    isScheduledFuture: false,
    isDue: true,
    isOverdue1h: overdueMins >= 60,
    badgeText,
    overdueSince,
    callElapsed,
  };
}

/**
 * Every call made in every box of this campaign, grouped by box.
 *
 * A box is worked by phoning several businesses at once, so the card needs all
 * of them, not only the one whose name ended up written on the slot.
 */
export async function fetchSlotContacts(
  campaignId: string,
): Promise<Record<string, SlotCall[]>> {
  try {
    const r = await fetch(
      `/api/prospecting/contacts/by-slot?campaign_id=${encodeURIComponent(campaignId)}`,
    );
    return r.ok ? await r.json() : {};
  } catch {
    return {};
  }
}

/** Write down a call: what happened, and when to make the next one. */
export async function recordContact(input: {
  businessName: string;
  campaignId?: string;
  categoryId?: number;
  slotNumber?: number;
  outcomeCode: string;
  note?: string;
  followUpDays?: number;
  followUpMinutes?: number;
}): Promise<ContactRecord['last'] & { count: number }> {
  const r = await fetch('/api/prospecting/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_name: input.businessName,
      campaign_id: input.campaignId,
      category_id: input.categoryId,
      slot_number: input.slotNumber,
      outcome_code: input.outcomeCode,
      note: input.note,
      follow_up_days: input.followUpDays,
      follow_up_minutes: input.followUpMinutes,
    }),
  });
  if (!r.ok) throw new Error(`POST contacts -> ${r.status}`);
  return await r.json();
}

/** Businesses resting right now, filtered as the operator types. */
export async function searchQuarantine(q: string): Promise<QuarantinedBusiness[]> {
  try {
    const r = await fetch(`/api/prospecting/quarantine?q=${encodeURIComponent(q)}`);
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

/** End the rest now. The history stays; only the clock is cleared. */
export async function releaseQuarantine(businessName: string): Promise<void> {
  const r = await fetch(
    `/api/prospecting/quarantine/release?business_name=${encodeURIComponent(businessName)}`,
    { method: 'POST' },
  );
  if (!r.ok) throw new Error(`POST quarantine/release -> ${r.status}`);
}
