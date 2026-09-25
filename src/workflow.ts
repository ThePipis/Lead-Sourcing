import { Campaign } from './types.ts';

/**
 * A campaign is one acceptance form with four numbered sections worked in
 * order. The dependencies below are the business's, not the UI's: curation is
 * not paid for before the campaign is funded, a manifest cannot be cut from
 * households that were never scored, and nothing is mailed before it is
 * printed. The gate is what makes the order visible instead of remembered.
 */

/**
 * A campaign is viable on two conditions at once, and the gate on section 2
 * states whichever one is still missing:
 *
 * 1. What has been collected covers the drop's own print and postage cost,
 *    which now follows the number of households rather than sitting at a flat
 *    $3,000.
 * 2. At least twelve of the fourteen slots are paid, so the card never goes
 *    out looking half empty.
 */
export const OPERATING_FLOOR = 10;
export const TOTAL_SLOTS = 31;
/** The reach the printed slot rates are quoted against. */
export const BASELINE_HOUSEHOLDS = 5000;

/**
 * Modular base weight per atomic small slot ($350 each).
 */
export const SLOT_WEIGHTS = Array(31).fill(350);

export type PhaseId = 'slots' | 'curation' | 'manifest' | 'production';

export const PHASE_ORDER: PhaseId[] = ['slots', 'curation', 'manifest', 'production'];

export interface PhaseState {
  id: PhaseId;
  /** 1-based section number as printed on the form. */
  number: number;
  done: boolean;
  /** Gate satisfied: the operator may work this section now. */
  open: boolean;
  /** i18n key explaining why the gate is shut. Present only when closed. */
  blockedKey?: string;
  blockedParams?: Record<string, string | number>;
  /** Short value printed in the section's summary box. */
  summaryKey: string;
  summaryParams?: Record<string, string | number>;
}

export interface CampaignProgress {
  phases: PhaseState[];
  /** The section the operator should be working right now. */
  current: PhaseId;
  /** i18n key for the single imperative this campaign is asking for. */
  imperativeKey: string;
  imperativeParams?: Record<string, string | number>;
  /** Phase the imperative sends the operator to. */
  imperativeTarget: PhaseId;
  /** Sections stamped complete. */
  completedCount: number;
}

const isInProduction = (c: Campaign) => c.status === 'IN_PRODUCTION' || c.status === 'MAILED';

export function computeProgress(campaign: Campaign, curatedCount: number): CampaignProgress {
  const paid = campaign.slots.filter(
    (s) => s.status === 'PAID' && s.slotNumber !== 32 && s.format !== 'USPS' && !s.notes?.startsWith('Covered by'),
  ).length;
  const collected = collectedUsd(campaign);
  const cost = dropCostUsd(campaign);
  const costCovered = collected >= cost;
  const slotsMet = paid >= OPERATING_FLOOR;
  const floorMet = costCovered && slotsMet;
  const curated = curatedCount > 0;
  const inProduction = isInProduction(campaign);
  const mailed = campaign.status === 'MAILED';

  const visibleCommercialSlots = [...campaign.slots]
    .filter((s) => !s.notes?.startsWith('Covered by') && s.slotNumber !== 32 && s.format !== 'USPS')
    .sort((a, b) => (a.displayNumber ?? a.slotNumber) - (b.displayNumber ?? b.slotNumber));

  const firstVacant = visibleCommercialSlots.find((s) => s.status === 'VACANT');
  const firstUnpaid = visibleCommercialSlots.find((s) => s.status !== 'PAID');

  const phases: PhaseState[] = [
    {
      id: 'slots',
      number: 1,
      done: floorMet,
      open: true,
      summaryKey: 'form.summary.slots',
      summaryParams: { paid, total: TOTAL_SLOTS },
    },
    {
      id: 'curation',
      number: 2,
      done: curated,
      open: floorMet,
      // Name the condition that is actually missing, not both at once.
      blockedKey: floorMet
        ? undefined
        : !costCovered
          ? 'form.blocked.curationCost'
          : 'form.blocked.curation',
      blockedParams: floorMet
        ? undefined
        : !costCovered
          ? { missing: Math.ceil(cost - collected).toLocaleString('en-US') }
          : { missing: OPERATING_FLOOR - paid, floor: OPERATING_FLOOR },
      summaryKey: curated ? 'form.summary.curationDone' : 'form.summary.curationPending',
      summaryParams: { count: curatedCount.toLocaleString('en-US') },
    },
    {
      id: 'manifest',
      number: 3,
      done: inProduction,
      open: curated,
      blockedKey: curated ? undefined : 'form.blocked.manifest',
      summaryKey: inProduction ? 'form.summary.manifestDone' : 'form.summary.manifestPending',
    },
    {
      id: 'production',
      number: 4,
      done: mailed,
      open: inProduction,
      blockedKey: inProduction ? undefined : 'form.blocked.production',
      summaryKey: mailed ? 'form.summary.productionMailed' : 'form.summary.productionPending',
    },
  ];

  // One imperative, derived from what the campaign actually owes.
  let imperativeKey: string;
  let imperativeParams: Record<string, string | number> | undefined;
  let imperativeTarget: PhaseId;

  if (!floorMet && firstVacant) {
    imperativeKey = 'form.imperative.fillSlot';
    imperativeParams = {
      slot: String(firstVacant.displayNumber ?? firstVacant.slotNumber).padStart(2, '0'),
    };
    imperativeTarget = 'slots';
  } else if (!floorMet && firstUnpaid) {
    imperativeKey = 'form.imperative.collectSlot';
    imperativeParams = {
      slot: String(firstUnpaid.displayNumber ?? firstUnpaid.slotNumber).padStart(2, '0'),
    };
    imperativeTarget = 'slots';
  } else if (!curated) {
    imperativeKey = 'form.imperative.runCuration';
    imperativeTarget = 'curation';
  } else if (!inProduction) {
    imperativeKey = 'form.imperative.exportManifest';
    imperativeTarget = 'manifest';
  } else if (!mailed) {
    imperativeKey = 'form.imperative.markMailed';
    imperativeTarget = 'production';
  } else if (firstVacant) {
    // Mailed, but the card went out with empty space. Worth naming.
    imperativeKey = 'form.imperative.fillSlot';
    imperativeParams = {
      slot: String(firstVacant.displayNumber ?? firstVacant.slotNumber).padStart(2, '0'),
    };
    imperativeTarget = 'slots';
  } else {
    imperativeKey = 'form.imperative.complete';
    imperativeTarget = 'production';
  }

  const current = phases.find((p) => p.open && !p.done)?.id ?? phases[phases.length - 1].id;

  return {
    phases,
    current,
    imperativeKey,
    imperativeParams,
    imperativeTarget,
    completedCount: phases.filter((p) => p.done).length,
  };
}

/**
 * What this drop costs us: the per-piece lines times the household count, plus
 * the fees charged once per drop. Both come from the cost model in section 1.
 */
export function dropCostUsd(campaign: Campaign): number {
  const unit = campaign.unitCostUsd ?? 0.6;
  const fixed = campaign.fixedCostUsd ?? 0;
  return Math.round(billableHouseholds(campaign) * unit + fixed);
}

/**
 * The pieces this drop actually prints and mails.
 *
 * Once carrier routes are selected that is the number: saturation buys whole
 * routes and the USPS bills on their delivery counts, not on the round figure
 * the operator typed. Before then, the target stands.
 */
export function billableHouseholds(campaign: Campaign): number {
  return campaign.coveredHouseholds && campaign.coveredHouseholds > 0
    ? campaign.coveredHouseholds
    : (campaign.totalTargetHouseholds ?? 0);
}

/** What a slot costs at this drop's reach, from its rate at 5,000 households. */
export function priceForReach(basePrice: number, households: number): number {
  return Math.round((basePrice * households) / BASELINE_HOUSEHOLDS);
}

/**
 * The same campaign as if its reach were `households`: every slot price moves
 * proportionally, the way the backend rescales it on commit. Used to preview a
 * reach while it is still being typed.
 */
export function scaleCampaignToReach(campaign: Campaign, households: number): Campaign {
  const unit = campaign.unitCostUsd ?? 0.6;
  const fixed = campaign.fixedCostUsd ?? 0;
  const cost = Math.round(households * unit + fixed);
  const revenue = campaign.slots.reduce((acc, s) => {
    if (s.format === 'USPS' || s.slotNumber === 32 || s.notes?.includes('Covered by')) return acc;
    return acc + (s.priceUsd || 0);
  }, 0);
  const margin = revenue > 0 ? (revenue - cost) / revenue : 0;

  return {
    ...campaign,
    totalTargetHouseholds: households,
    operatingCostEst: cost,
    targetGrossRevenue: revenue,
    targetMargin: margin,
    netMarginEst: Math.max(0, revenue - cost),
    slots: campaign.slots,
  };
}

/** Money actually collected, which can differ from list price after negotiation. */
export function collectedUsd(campaign: Campaign): number {
  return campaign.slots
    .filter((s) => s.status === 'PAID')
    .reduce((acc, s) => acc + (s.amountCollectedUsd ?? s.priceUsd), 0);
}

/** List value of every slot on the card, sold or not. */
export function contractedUsd(campaign: Campaign): number {
  return campaign.slots.reduce((acc, s) => acc + s.priceUsd, 0);
}
