import { SlotState, SlotFormat, CardSide, SlotStatus } from '../types.ts';
import { CLOSED_CATEGORIES } from '../data/categories.ts';

export const MODULAR_PRICES: Record<SlotFormat, number> = {
  SMALL: 350,
  MEDIUM: 650,
  LARGE: 1200,
  USPS: 0,
};

export const RESERVATION_HOLD_HOURS = 72;
export const RESERVATION_HOLD_MS = RESERVATION_HOLD_HOURS * 60 * 60 * 1000;

export interface ModularCellDef {
  slotNumber: number;
  side: CardSide;
  gridRow: number; // 1..4
  gridCol: number; // 1..4
  defaultFormat: SlotFormat;
  categoryId: number;
  isUspsZone?: boolean;
}

/**
 * 4x4 Grid definition for both Front and Back faces
 * Front: 16 atomic cells (1..16)
 * Back: 15 atomic cells (17..31) + 1 USPS technical zone (32 at row: 4, col: 4)
 */
export const MODULAR_GRID_DEFS: ModularCellDef[] = [
  // FRONT FACE - Rows 1 & 2 (Top block, above banner)
  { slotNumber: 1, side: 'FRONT', gridRow: 1, gridCol: 1, defaultFormat: 'SMALL', categoryId: 1 },
  { slotNumber: 2, side: 'FRONT', gridRow: 1, gridCol: 2, defaultFormat: 'SMALL', categoryId: 2 },
  { slotNumber: 3, side: 'FRONT', gridRow: 1, gridCol: 3, defaultFormat: 'SMALL', categoryId: 3 },
  { slotNumber: 4, side: 'FRONT', gridRow: 1, gridCol: 4, defaultFormat: 'SMALL', categoryId: 4 },
  { slotNumber: 5, side: 'FRONT', gridRow: 2, gridCol: 1, defaultFormat: 'SMALL', categoryId: 5 },
  { slotNumber: 6, side: 'FRONT', gridRow: 2, gridCol: 2, defaultFormat: 'SMALL', categoryId: 6 },
  { slotNumber: 7, side: 'FRONT', gridRow: 2, gridCol: 3, defaultFormat: 'SMALL', categoryId: 7 },
  { slotNumber: 8, side: 'FRONT', gridRow: 2, gridCol: 4, defaultFormat: 'SMALL', categoryId: 8 },

  // FRONT FACE - Rows 3 & 4 (Bottom block, below banner)
  { slotNumber: 9, side: 'FRONT', gridRow: 3, gridCol: 1, defaultFormat: 'SMALL', categoryId: 9 },
  { slotNumber: 10, side: 'FRONT', gridRow: 3, gridCol: 2, defaultFormat: 'SMALL', categoryId: 10 },
  { slotNumber: 11, side: 'FRONT', gridRow: 3, gridCol: 3, defaultFormat: 'SMALL', categoryId: 11 },
  { slotNumber: 12, side: 'FRONT', gridRow: 3, gridCol: 4, defaultFormat: 'SMALL', categoryId: 12 },
  { slotNumber: 13, side: 'FRONT', gridRow: 4, gridCol: 1, defaultFormat: 'SMALL', categoryId: 13 },
  { slotNumber: 14, side: 'FRONT', gridRow: 4, gridCol: 2, defaultFormat: 'SMALL', categoryId: 14 },
  { slotNumber: 15, side: 'FRONT', gridRow: 4, gridCol: 3, defaultFormat: 'SMALL', categoryId: 15 },
  { slotNumber: 16, side: 'FRONT', gridRow: 4, gridCol: 4, defaultFormat: 'SMALL', categoryId: 16 },

  // BACK FACE - Rows 1 & 2 (Top block, above banner)
  { slotNumber: 17, side: 'BACK', gridRow: 1, gridCol: 1, defaultFormat: 'SMALL', categoryId: 17 },
  { slotNumber: 18, side: 'BACK', gridRow: 1, gridCol: 2, defaultFormat: 'SMALL', categoryId: 18 },
  { slotNumber: 19, side: 'BACK', gridRow: 1, gridCol: 3, defaultFormat: 'SMALL', categoryId: 19 },
  { slotNumber: 20, side: 'BACK', gridRow: 1, gridCol: 4, defaultFormat: 'SMALL', categoryId: 20 },
  { slotNumber: 21, side: 'BACK', gridRow: 2, gridCol: 1, defaultFormat: 'SMALL', categoryId: 21 },
  { slotNumber: 22, side: 'BACK', gridRow: 2, gridCol: 2, defaultFormat: 'SMALL', categoryId: 22 },
  { slotNumber: 23, side: 'BACK', gridRow: 2, gridCol: 3, defaultFormat: 'SMALL', categoryId: 23 },
  { slotNumber: 24, side: 'BACK', gridRow: 2, gridCol: 4, defaultFormat: 'SMALL', categoryId: 24 },

  // BACK FACE - Rows 3 & 4 (Bottom block, below banner)
  { slotNumber: 25, side: 'BACK', gridRow: 3, gridCol: 1, defaultFormat: 'SMALL', categoryId: 25 },
  { slotNumber: 26, side: 'BACK', gridRow: 3, gridCol: 2, defaultFormat: 'SMALL', categoryId: 26 },
  { slotNumber: 27, side: 'BACK', gridRow: 3, gridCol: 3, defaultFormat: 'SMALL', categoryId: 27 },
  { slotNumber: 28, side: 'BACK', gridRow: 3, gridCol: 4, defaultFormat: 'SMALL', categoryId: 28 },
  { slotNumber: 29, side: 'BACK', gridRow: 4, gridCol: 1, defaultFormat: 'SMALL', categoryId: 29 },
  { slotNumber: 30, side: 'BACK', gridRow: 4, gridCol: 2, defaultFormat: 'SMALL', categoryId: 30 },
  { slotNumber: 31, side: 'BACK', gridRow: 4, gridCol: 3, defaultFormat: 'SMALL', categoryId: 31 },
  // Slot 32: USPS EDDM Indicia Technical Zone (Fixed on Row 4, Col 4)
  { slotNumber: 32, side: 'BACK', gridRow: 4, gridCol: 4, defaultFormat: 'USPS', categoryId: 32, isUspsZone: true },
];

/**
 * Normalizes any slot list (even legacy 14 slots) into the modular 31+1 grid layout
 */
export function normalizeModularSlots(existingSlots: SlotState[]): SlotState[] {
  const mapByNumber = new Map<number, SlotState>();
  existingSlots.forEach((s) => mapByNumber.set(s.slotNumber, s));

  const rawSlots: SlotState[] = MODULAR_GRID_DEFS.map((def): SlotState => {
    const existing = mapByNumber.get(def.slotNumber);
    const cat = CLOSED_CATEGORIES.find((c) => c.id === def.categoryId) ?? CLOSED_CATEGORIES[0];

    if (def.isUspsZone) {
      return {
        slotNumber: 32,
        categoryId: 32,
        categoryName: 'USPS EDDM Technical Zone',
        status: 'PAID' as SlotStatus,
        priceUsd: 0,
        format: 'USPS' as SlotFormat,
        side: 'BACK',
        gridRow: 4,
        gridCol: 4,
        rowSpan: 1,
        colSpan: 1,
        scanCount: 0,
      };
    }

    if (existing) {
      let format: SlotFormat = existing.format || 'SMALL';
      if (!existing.format) {
        if (existing.rowSpan === 2 && existing.colSpan === 2) {
          format = 'LARGE';
        } else if (existing.rowSpan === 2) {
          format = 'MEDIUM';
        } else {
          format = 'SMALL';
        }
      } else if (existing.format === 'SMALL' && (existing.rowSpan === 1 || !existing.rowSpan) && (existing.colSpan === 1 || !existing.colSpan)) {
        format = 'SMALL';
      }

      // Check ghost notes on this slot
      let notes = existing.notes;
      if (notes?.includes('Covered by')) {
        const match = notes.match(/#(\d+)/);
        const primaryNum = match ? parseInt(match[1], 10) : null;
        const primarySlot = primaryNum ? existingSlots.find((s) => s.slotNumber === primaryNum) : null;
        if (!primarySlot || primarySlot.format === 'SMALL' || (primarySlot.rowSpan === 1 && primarySlot.colSpan === 1)) {
          // Primary is small, so this slot is no longer covered
          notes = undefined;
        }
      }

      const rowSpan = format === 'LARGE' || format === 'MEDIUM' ? 2 : 1;
      const colSpan = format === 'LARGE' ? 2 : 1;

      const defaultPrice =
        MODULAR_PRICES[format] || (format === 'LARGE' ? 1200 : format === 'MEDIUM' ? 650 : 350);
      const priceUsd =
        typeof existing.priceUsd === 'number' && !isNaN(existing.priceUsd) && existing.priceUsd > 0
          ? existing.priceUsd
          : defaultPrice;

      return {
        ...existing,
        format,
        side: def.side,
        gridRow: def.gridRow,
        gridCol: def.gridCol,
        rowSpan,
        colSpan,
        priceUsd,
        notes,
        categoryName: existing.categoryName || cat.name,
        offerHeadline: existing.offerHeadline || cat.defaultHeadline,
      };
    }

    // Default new vacant slot
    return {
      slotNumber: def.slotNumber,
      categoryId: def.categoryId,
      categoryName: cat.name,
      status: 'VACANT' as SlotStatus,
      priceUsd: MODULAR_PRICES[def.defaultFormat],
      format: def.defaultFormat,
      side: def.side,
      gridRow: def.gridRow,
      gridCol: def.gridCol,
      rowSpan: 1,
      colSpan: 1,
      scanCount: 0,
      offerHeadline: cat.defaultHeadline,
      avgTicketUsd: cat.avgTicketUsd,
    };
  });

  return computeAdaptiveDisplayNumbers(rawSlots);
}

/**
 * Checks if a slot can be merged vertically into a MEDIUM (1x2) slot
 */
export function canMergeVertical(slot: SlotState, slots: SlotState[]): boolean {
  if (slot.format === 'MEDIUM' || slot.format === 'LARGE' || slot.format === 'USPS') return false;
  if (!slot.gridRow || !slot.gridCol) return false;
  if (slot.notes?.startsWith('Covered by')) return false;

  // We can merge top half (row 1 with row 2) or bottom half (row 3 with row 4)
  const targetRow = slot.gridRow === 1 ? 2 : slot.gridRow === 3 ? 4 : null;
  if (!targetRow) return false;

  const partner = slots.find(
    (s) => s.side === slot.side && s.gridCol === slot.gridCol && s.gridRow === targetRow
  );

  if (!partner) return false;
  if (partner.format === 'USPS' || partner.format === 'LARGE' || partner.format === 'MEDIUM') return false;
  if (partner.notes?.startsWith('Covered by')) return false;
  // Can merge if partner is VACANT or belongs to the same advertiser
  return partner.status === 'VACANT' || (partner.businessName === slot.businessName && slot.status !== 'PAID');
}

export interface LargeOriginCandidate {
  originRow: number;
  originCol: number;
  coveredCoords: { r: number; c: number }[];
  anchorSlot: SlotState;
}

/**
 * Finds the optimal 2x2 quadrant origin for expanding a slot into a LARGE (2x2) format.
 * Prioritizes expanding to the right from the current column, ensuring that no USPS
 * technical zones, PAID slots, or other existing merged (MEDIUM/LARGE) slots are destroyed.
 */
export function findBestLargeOrigin(
  slot: SlotState,
  slots: SlotState[]
): LargeOriginCandidate | null {
  if (slot.format === 'LARGE' || slot.format === 'USPS' || slot.slotNumber === 32) return null;
  if (!slot.gridRow || !slot.gridCol) return null;
  if (slot.notes?.startsWith('Covered by')) return null;
  if (slot.status === 'PAID') return null;

  const originRow = slot.gridRow <= 2 ? 1 : 3;
  const col = slot.gridCol;

  // Potential starting columns for a 2-column wide block containing col
  // Order prioritizes expanding to the right from the current slot:
  // - col 1: [1] (cols 1 & 2)
  // - col 2: [2, 1] (prefers cols 2 & 3 to the right; fallback to cols 1 & 2 to the left)
  // - col 3: [3, 2] (prefers cols 3 & 4 to the right; fallback to cols 2 & 3 to the left)
  // - col 4: [3] (cols 3 & 4)
  const candidateCols =
    col === 1 ? [1] :
    col === 2 ? [2, 1] :
    col === 3 ? [3, 2] :
    [3];

  for (const candCol of candidateCols) {
    const coveredCoords = [
      { r: originRow, c: candCol },
      { r: originRow + 1, c: candCol },
      { r: originRow, c: candCol + 1 },
      { r: originRow + 1, c: candCol + 1 },
    ];

    const quadrantSlots = slots.filter(
      (s) =>
        s.side === slot.side &&
        coveredCoords.some((coord) => coord.r === s.gridRow && coord.c === s.gridCol)
    );

    if (quadrantSlots.length < 4) continue;

    // 1. Cannot contain USPS technical zone (slot 32)
    if (quadrantSlots.some((s) => s.format === 'USPS' || s.slotNumber === 32)) {
      continue;
    }

    // 2. Cannot contain any slot already in format LARGE (or large covered slot)
    if (
      quadrantSlots.some(
        (s) =>
          s.format === 'LARGE' ||
          (s.rowSpan === 2 && s.colSpan === 2) ||
          s.notes?.includes('Covered by large')
      )
    ) {
      continue;
    }

    // 3. Cannot contain any PAID slot
    if (quadrantSlots.some((s) => s.status === 'PAID')) {
      continue;
    }

    // 4. Must not alter or destroy any OTHER existing merged slot (e.g. MEDIUM)
    // Every slot in the quadrant must either:
    // - Be the slot being expanded
    // - Be covered by the slot being expanded (if slot was already MEDIUM)
    // - Be an atomic SMALL slot with no 'Covered by' notes!
    const destroysOtherMergedSlot = quadrantSlots.some((s) => {
      if (s.slotNumber === slot.slotNumber) return false;
      if (s.notes?.includes(`#${slot.slotNumber}`)) return false;
      if (s.format === 'MEDIUM' || s.notes?.startsWith('Covered by')) {
        return true;
      }
      return false;
    });

    if (destroysOtherMergedSlot) {
      continue;
    }

    // 5. At most one distinct active business name across all 4 cells
    const activeBusinesses = new Set(
      quadrantSlots
        .filter((s) => s.businessName && s.status !== 'VACANT')
        .map((s) => s.businessName?.trim().toLowerCase())
    );
    if (activeBusinesses.size > 1) {
      continue;
    }

    // Anchor slot is the top-left slot of this 2x2
    const anchorSlot =
      quadrantSlots.find((s) => s.gridRow === originRow && s.gridCol === candCol) ?? slot;

    return {
      originRow,
      originCol: candCol,
      coveredCoords,
      anchorSlot,
    };
  }

  return null;
}

/**
 * Checks if a slot can be expanded into a LARGE (2x2) quadrant
 */
export function canMergeLarge(slot: SlotState, slots: SlotState[]): boolean {
  return findBestLargeOrigin(slot, slots) !== null;
}

/**
 * Merges a primary slot with neighboring cells to form MEDIUM ($650) or LARGE ($1,200)
 */
export function mergeModularSlot(
  primarySlotNum: number,
  targetFormat: 'MEDIUM' | 'LARGE',
  slots: SlotState[]
): SlotState[] {
  // Ensure slots are normalized with coordinates and full 32-slot layout
  const normalized = normalizeModularSlots(slots);
  const primary = normalized.find((s) => s.slotNumber === primarySlotNum);
  if (!primary || !primary.gridRow || !primary.gridCol) return normalized;

  const row = primary.gridRow;
  const col = primary.gridCol;
  const side = primary.side;

  if (targetFormat === 'MEDIUM') {
    const partnerRow = row === 1 ? 2 : row === 3 ? 4 : row;
    const partner = normalized.find(
      (s) => s.side === side && s.gridCol === col && s.gridRow === partnerRow && s.slotNumber !== primarySlotNum
    );
    const existingMed = normalized.find((s) => s.format === 'MEDIUM' && s.priceUsd);
    const medPrice = existingMed?.priceUsd ?? (primary.priceUsd ? Math.round((primary.priceUsd * 650) / 350 / 5) * 5 : MODULAR_PRICES.MEDIUM);

    return computeAdaptiveDisplayNumbers(normalized.map((s) => {
      if (s.slotNumber === primarySlotNum) {
        return {
          ...s,
          format: 'MEDIUM',
          rowSpan: 2,
          colSpan: 1,
          priceUsd: medPrice,
          notes: undefined,
        };
      }
      if (partner && s.slotNumber === partner.slotNumber) {
        // Partner is absorbed into primary slot
        return {
          ...s,
          format: 'MEDIUM',
          status: 'VACANT',
          notes: `Covered by slot #${primarySlotNum}`,
        };
      }
      return s;
    }));
  }

  if (targetFormat === 'LARGE') {
    const origin = findBestLargeOrigin(primary, normalized);
    if (!origin) return normalized;

    const { originRow, originCol, coveredCoords, anchorSlot } = origin;

    // Pick advertiser data from whichever slot had active business data
    const slotWithData =
      primary.businessName && primary.status !== 'VACANT'
        ? primary
        : anchorSlot.businessName && anchorSlot.status !== 'VACANT'
        ? anchorSlot
        : normalized.find(
            (s) =>
              s.side === side &&
              coveredCoords.some((c) => c.r === s.gridRow && c.c === s.gridCol) &&
              s.businessName &&
              s.status !== 'VACANT'
          ) ?? primary;

    const mainSlotNumber = anchorSlot.slotNumber;
    const existingLg = normalized.find((s) => s.format === 'LARGE' && s.priceUsd);
    const lgPrice = existingLg?.priceUsd ?? (primary.priceUsd ? Math.round((primary.priceUsd * 1200) / 350 / 5) * 5 : MODULAR_PRICES.LARGE);

    return computeAdaptiveDisplayNumbers(normalized.map((s) => {
      if (s.slotNumber === mainSlotNumber) {
        return {
          ...s,
          categoryId: slotWithData.categoryId,
          categoryName: slotWithData.categoryName,
          businessName: slotWithData.businessName,
          contactPerson: slotWithData.contactPerson,
          phone: slotWithData.phone,
          email: slotWithData.email,
          website: slotWithData.website,
          status: slotWithData.status,
          logoUrl: slotWithData.logoUrl,
          offerHeadline: slotWithData.offerHeadline,
          avgTicketUsd: slotWithData.avgTicketUsd,
          paymentRef: slotWithData.paymentRef,
          paidAt: slotWithData.paidAt,
          amountCollectedUsd: slotWithData.amountCollectedUsd,
          scanCount: slotWithData.scanCount,
          format: 'LARGE',
          rowSpan: 2,
          colSpan: 2,
          gridRow: originRow,
          gridCol: originCol,
          priceUsd: lgPrice,
          notes: undefined,
        };
      }
      const isCovered = coveredCoords.some((coord) => s.side === side && s.gridRow === coord.r && s.gridCol === coord.c);
      if (isCovered && s.slotNumber !== mainSlotNumber) {
        return {
          ...s,
          format: 'LARGE',
          status: 'VACANT',
          businessName: undefined,
          offerHeadline: undefined,
          phone: undefined,
          notes: `Covered by large slot #${mainSlotNumber}`,
        };
      }
      return s;
    }));
  }

  return normalized;
}

/**
 * Splits a merged MEDIUM or LARGE slot back into atomic SMALL ($350) slots,
 * or splits a LARGE (2×2) slot into two vertical MEDIUM (1×2, $650) slots.
 */
export function splitModularSlot(
  primarySlotNum: number,
  slots: SlotState[],
  targetFormat: 'SMALL' | 'MEDIUM' = 'SMALL'
): SlotState[] {
  const normalized = normalizeModularSlots(slots);
  const primary = normalized.find((s) => s.slotNumber === primarySlotNum);
  if (!primary) return normalized;

  const existingSmall = normalized.find((s) => s.format === 'SMALL' && s.priceUsd && s.slotNumber !== 32);
  const activeSmallPrice = existingSmall?.priceUsd
    ?? (primary.priceUsd ? Math.round((primary.priceUsd * 350) / (primary.format === 'LARGE' ? 1200 : 650) / 5) * 5 : MODULAR_PRICES.SMALL);

  const existingMed = normalized.find((s) => s.format === 'MEDIUM' && s.priceUsd && s.slotNumber !== 32);
  const activeMedPrice = existingMed?.priceUsd
    ?? (primary.priceUsd ? Math.round((primary.priceUsd * 650) / (primary.format === 'LARGE' ? 1200 : 350) / 5) * 5 : MODULAR_PRICES.MEDIUM);

  // If primary was LARGE and targetFormat is MEDIUM, split 2x2 into two 1x2 MEDIUM slots
  if (primary.format === 'LARGE' && targetFormat === 'MEDIUM') {
    const originRow = primary.gridRow ?? 1;
    const originCol = primary.gridCol ?? 1;
    const side = primary.side;

    const getCoord = (s: SlotState) => {
      const def = MODULAR_GRID_DEFS.find((d) => d.slotNumber === s.slotNumber);
      return {
        r: s.gridRow ?? def?.gridRow ?? 1,
        c: s.gridCol ?? def?.gridCol ?? 1,
        side: s.side ?? def?.side ?? 'FRONT',
      };
    };

    const leftBottom = normalized.find((s) => {
      const coord = getCoord(s);
      return coord.side === side && coord.r === originRow + 1 && coord.c === originCol;
    });
    const rightTop = normalized.find((s) => {
      const coord = getCoord(s);
      return coord.side === side && coord.r === originRow && coord.c === originCol + 1;
    });
    const rightBottom = normalized.find((s) => {
      const coord = getCoord(s);
      return coord.side === side && coord.r === originRow + 1 && coord.c === originCol + 1;
    });

    const rightTopNum = rightTop?.slotNumber;

    return computeAdaptiveDisplayNumbers(normalized.map((s) => {
      // 1. Left column top: Primary slot stays, becomes MEDIUM (1x2)
      if (s.slotNumber === primarySlotNum) {
        return {
          ...s,
          format: 'MEDIUM',
          rowSpan: 2,
          colSpan: 1,
          gridRow: originRow,
          gridCol: originCol,
          priceUsd: activeMedPrice,
          notes: undefined,
        };
      }

      // 2. Left column bottom: covered by primarySlotNum
      if (leftBottom && s.slotNumber === leftBottom.slotNumber) {
        return {
          ...s,
          format: 'MEDIUM',
          rowSpan: 1,
          colSpan: 1,
          gridRow: originRow + 1,
          gridCol: originCol,
          status: 'VACANT',
          priceUsd: activeMedPrice,
          businessName: undefined,
          contactPerson: undefined,
          phone: undefined,
          email: undefined,
          website: undefined,
          logoUrl: undefined,
          offerHeadline: undefined,
          notes: `Covered by slot #${primarySlotNum}`,
        };
      }

      // 3. Right column top: becomes a new independent VACANT MEDIUM slot
      if (rightTop && s.slotNumber === rightTop.slotNumber) {
        const def = MODULAR_GRID_DEFS.find((d) => d.slotNumber === s.slotNumber);
        const cat = CLOSED_CATEGORIES.find((c) => c.id === def?.categoryId);
        return {
          ...s,
          format: 'MEDIUM',
          rowSpan: 2,
          colSpan: 1,
          gridRow: originRow,
          gridCol: originCol + 1,
          status: 'VACANT',
          priceUsd: activeMedPrice,
          categoryName: cat?.name ?? s.categoryName,
          offerHeadline: cat?.defaultHeadline ?? s.offerHeadline,
          businessName: undefined,
          contactPerson: undefined,
          phone: undefined,
          email: undefined,
          website: undefined,
          logoUrl: undefined,
          notes: undefined,
        };
      }

      // 4. Right column bottom: covered by rightTopNum
      if (rightBottom && s.slotNumber === rightBottom.slotNumber) {
        return {
          ...s,
          format: 'MEDIUM',
          rowSpan: 1,
          colSpan: 1,
          gridRow: originRow + 1,
          gridCol: originCol + 1,
          status: 'VACANT',
          priceUsd: activeMedPrice,
          businessName: undefined,
          contactPerson: undefined,
          phone: undefined,
          email: undefined,
          website: undefined,
          logoUrl: undefined,
          offerHeadline: undefined,
          notes: rightTopNum ? `Covered by slot #${rightTopNum}` : `Covered by slot`,
        };
      }

      return s;
    }));
  }

  // Target is SMALL (split to atomic 1x1 cells)
  return computeAdaptiveDisplayNumbers(normalized.map((s) => {
    if (s.slotNumber === primarySlotNum) {
      const def = MODULAR_GRID_DEFS.find((d) => d.slotNumber === primarySlotNum);
      const cat = CLOSED_CATEGORIES.find((c) => c.id === def?.categoryId);
      return {
        ...s,
        format: 'SMALL',
        rowSpan: 1,
        colSpan: 1,
        gridRow: def?.gridRow ?? s.gridRow,
        gridCol: def?.gridCol ?? s.gridCol,
        priceUsd: activeSmallPrice,
        notes: undefined,
      };
    }
    if (s.notes?.includes(`Covered by`) && (s.notes?.includes(`#${primarySlotNum}`) || s.notes?.includes(`slot #${primarySlotNum}`))) {
      const def = MODULAR_GRID_DEFS.find((d) => d.slotNumber === s.slotNumber);
      const cat = CLOSED_CATEGORIES.find((c) => c.id === def?.categoryId);
      return {
        ...s,
        format: 'SMALL',
        rowSpan: 1,
        colSpan: 1,
        gridRow: def?.gridRow ?? s.gridRow,
        gridCol: def?.gridCol ?? s.gridCol,
        status: 'VACANT',
        priceUsd: activeSmallPrice,
        categoryName: cat?.name ?? s.categoryName,
        offerHeadline: cat?.defaultHeadline ?? s.offerHeadline,
        notes: undefined,
      };
    }
    return s;
  }));
}

/**
 * Helper to copy advertiser fields from one slot to another
 */
function copyAdvertiserFields(source: SlotState, destination: SlotState): SlotState {
  return {
    ...destination,
    categoryId: source.categoryId,
    categoryName: source.categoryName,
    businessName: source.businessName,
    contactPerson: source.contactPerson,
    phone: source.phone,
    email: source.email,
    website: source.website,
    status: source.status,
    logoUrl: source.logoUrl,
    offerHeadline: source.offerHeadline,
    avgTicketUsd: source.avgTicketUsd,
    paymentRef: source.paymentRef,
    paidAt: source.paidAt,
    amountCollectedUsd: source.amountCollectedUsd,
    scanCount: source.scanCount,
  };
}

/**
 * Swaps two modular slots or modular groups (Small, Medium, Large) in the grid,
 * swapping formats and advertiser data across columns or quadrants.
 */
function internalSwapModularSlots(
  sourceSlotNum: number,
  targetSlotNum: number,
  slots: SlotState[]
): SlotState[] {
  if (sourceSlotNum === targetSlotNum) return slots;
  const normalized = normalizeModularSlots(slots);

  const rawSource = normalized.find((s) => s.slotNumber === sourceSlotNum);
  const rawTarget = normalized.find((s) => s.slotNumber === targetSlotNum);
  if (!rawSource || !rawTarget) return normalized;

  // Resolve primary slot if either source or target is a covered slot
  const resolvePrimary = (s: SlotState): SlotState => {
    if (s.notes?.includes('Covered by')) {
      const match = s.notes.match(/#(\d+)/);
      if (match) {
        const parentNum = parseInt(match[1], 10);
        const parent = normalized.find((item) => item.slotNumber === parentNum);
        if (parent) return parent;
      }
    }
    return s;
  };

  const source = resolvePrimary(rawSource);
  const target = resolvePrimary(rawTarget);
  if (source.slotNumber === target.slotNumber) return normalized;

  // Never allow moving or overwriting USPS technical zone (slot 32)
  if (source.format === 'USPS' || target.format === 'USPS' || source.slotNumber === 32 || target.slotNumber === 32) {
    return normalized;
  }

  const srcFmt = source.format || 'SMALL';
  const tgtFmt = target.format || 'SMALL';

  const getColSlots = (s: SlotState) => {
    const rowBase = (s.gridRow ?? 1) <= 2 ? 1 : 3;
    const col = s.gridCol ?? 1;
    const top = normalized.find((item) => item.side === s.side && item.gridCol === col && item.gridRow === rowBase);
    const bottom = normalized.find((item) => item.side === s.side && item.gridCol === col && item.gridRow === rowBase + 1);
    return { top, bottom, col, rowBase, side: s.side };
  };

  // CASE 1: Both are SMALL (1x1)
  if (srcFmt === 'SMALL' && tgtFmt === 'SMALL') {
    const srcData = copyAdvertiserFields(source, target);
    const tgtData = copyAdvertiserFields(target, source);
    return normalized.map((s) => {
      if (s.slotNumber === source.slotNumber) return tgtData;
      if (s.slotNumber === target.slotNumber) return srcData;
      return s;
    });
  }

  // CASE 2: Both are LARGE (2x2)
  if (srcFmt === 'LARGE' && tgtFmt === 'LARGE') {
    const srcData = copyAdvertiserFields(source, target);
    const tgtData = copyAdvertiserFields(target, source);
    return normalized.map((s) => {
      if (s.slotNumber === source.slotNumber) return tgtData;
      if (s.slotNumber === target.slotNumber) return srcData;
      return s;
    });
  }

  // CASE 3: One is LARGE (2x2) and the other is SMALL or MEDIUM
  if (srcFmt === 'LARGE' || tgtFmt === 'LARGE') {
    const lgSlot = srcFmt === 'LARGE' ? source : target;
    const otherSlot = srcFmt === 'LARGE' ? target : source;

    const sideA = lgSlot.side;
    const rowBaseA = (lgSlot.gridRow ?? 1) <= 2 ? 1 : 3;
    const colStartA = lgSlot.gridCol ?? 1;

    const sideB = otherSlot.side;
    const rowBaseB = (otherSlot.gridRow ?? 1) <= 2 ? 1 : 3;
    const otherCol = otherSlot.gridCol ?? 1;

    // Disallow if otherSlot is inside this large slot itself
    if (sideA === sideB && rowBaseA === rowBaseB && (otherCol === colStartA || otherCol === colStartA + 1)) {
      return normalized;
    }

    const updates = new Map<number, SlotState>();

    const getColInBlock = (side: CardSide, rowBase: number, col: number) => {
      const top = normalized.find((s) => s.side === side && s.gridRow === rowBase && s.gridCol === col)!;
      const bot = normalized.find((s) => s.side === side && s.gridRow === rowBase + 1 && s.gridCol === col)!;
      const isMed = top?.format === 'MEDIUM';
      return { top, bot, isMed, col };
    };

    const applyColToDest = (
      srcColData: { top: SlotState; bot: SlotState; isMed: boolean },
      destTop: SlotState,
      destBot: SlotState
    ) => {
      if (srcColData.isMed) {
        const medData = copyAdvertiserFields(srcColData.top, destTop);
        updates.set(destTop.slotNumber, {
          ...medData,
          format: 'MEDIUM',
          rowSpan: 2,
          colSpan: 1,
          priceUsd: srcColData.top.priceUsd || MODULAR_PRICES.MEDIUM,
          notes: undefined,
        });
        updates.set(destBot.slotNumber, {
          ...destBot,
          format: 'MEDIUM',
          status: 'VACANT',
          businessName: undefined,
          offerHeadline: undefined,
          phone: undefined,
          notes: `Covered by slot #${destTop.slotNumber}`,
        });
      } else {
        const topData = copyAdvertiserFields(srcColData.top, destTop);
        const botData = copyAdvertiserFields(srcColData.bot, destBot);
        updates.set(destTop.slotNumber, {
          ...topData,
          format: 'SMALL',
          rowSpan: 1,
          colSpan: 1,
          priceUsd: srcColData.top.priceUsd || MODULAR_PRICES.SMALL,
          notes: undefined,
        });
        updates.set(destBot.slotNumber, {
          ...botData,
          format: 'SMALL',
          rowSpan: 1,
          colSpan: 1,
          priceUsd: srcColData.bot.priceUsd || MODULAR_PRICES.SMALL,
          notes: undefined,
        });
      }
    };

    const placeLargeAt = (side: CardSide, rowBase: number, colStart: number) => {
      const anchor = normalized.find((s) => s.side === side && s.gridRow === rowBase && s.gridCol === colStart);
      const covBotLeft = normalized.find((s) => s.side === side && s.gridRow === rowBase + 1 && s.gridCol === colStart);
      const covTopRight = normalized.find((s) => s.side === side && s.gridRow === rowBase && s.gridCol === colStart + 1);
      const covBotRight = normalized.find((s) => s.side === side && s.gridRow === rowBase + 1 && s.gridCol === colStart + 1);

      if (!anchor || !covBotLeft || !covTopRight || !covBotRight) return false;

      const lgAdvertiser = copyAdvertiserFields(lgSlot, anchor);
      updates.set(anchor.slotNumber, {
        ...lgAdvertiser,
        format: 'LARGE',
        rowSpan: 2,
        colSpan: 2,
        priceUsd: lgSlot.priceUsd || MODULAR_PRICES.LARGE,
        notes: undefined,
      });

      const lgCoveredNotes = `Covered by large slot #${anchor.slotNumber}`;
      [covBotLeft, covTopRight, covBotRight].forEach((cov) => {
        updates.set(cov.slotNumber, {
          ...cov,
          format: 'LARGE',
          status: 'VACANT',
          businessName: undefined,
          offerHeadline: undefined,
          phone: undefined,
          notes: lgCoveredNotes,
        });
      });

      return true;
    };

    // SUBCASE A: SAME BLOCK SWAP
    if (sideA === sideB && rowBaseA === rowBaseB) {
      const col1 = getColInBlock(sideA, rowBaseA, 1);
      const col2 = getColInBlock(sideA, rowBaseA, 2);
      const col3 = getColInBlock(sideA, rowBaseA, 3);
      const col4 = getColInBlock(sideA, rowBaseA, 4);

      if (!col1.top || !col2.top || !col3.top || !col4.top) return normalized;

      const dest = (c: number) => ({
        top: normalized.find((s) => s.side === sideA && s.gridRow === rowBaseA && s.gridCol === c)!,
        bot: normalized.find((s) => s.side === sideA && s.gridRow === rowBaseA + 1 && s.gridCol === c)!,
      });

      if (colStartA === 1) {
        if (otherCol === 3) {
          // Move Grande to CENTER (cols 2 & 3), col 3 moves to col 1, col 4 stays
          placeLargeAt(sideA, rowBaseA, 2);
          applyColToDest(col3, dest(1).top, dest(1).bot);
        } else if (otherCol === 4) {
          // Move Grande to RIGHT (cols 3 & 4), col 4 moves to col 1, col 3 moves to col 2
          if (sideA === 'BACK' && rowBaseA === 3) return normalized; // USPS 32
          placeLargeAt(sideA, rowBaseA, 3);
          applyColToDest(col4, dest(1).top, dest(1).bot);
          applyColToDest(col3, dest(2).top, dest(2).bot);
        }
      } else if (colStartA === 2) {
        if (otherCol === 1) {
          // Move Grande to LEFT (cols 1 & 2), col 1 moves to col 3, col 4 stays
          placeLargeAt(sideA, rowBaseA, 1);
          applyColToDest(col1, dest(3).top, dest(3).bot);
        } else if (otherCol === 4) {
          // Move Grande to RIGHT (cols 3 & 4), col 4 moves to col 2, col 1 stays
          if (sideA === 'BACK' && rowBaseA === 3) return normalized; // USPS 32
          placeLargeAt(sideA, rowBaseA, 3);
          applyColToDest(col4, dest(2).top, dest(2).bot);
        }
      } else if (colStartA === 3) {
        if (otherCol === 2) {
          // Move Grande to CENTER (cols 2 & 3), col 2 moves to col 4, col 1 stays
          placeLargeAt(sideA, rowBaseA, 2);
          applyColToDest(col2, dest(4).top, dest(4).bot);
        } else if (otherCol === 1) {
          // Move Grande to LEFT (cols 1 & 2), col 1 moves to col 3, col 2 moves to col 4
          placeLargeAt(sideA, rowBaseA, 1);
          applyColToDest(col1, dest(3).top, dest(3).bot);
          applyColToDest(col2, dest(4).top, dest(4).bot);
        }
      }

      return normalized.map((s) => updates.get(s.slotNumber) || s);
    }

    // SUBCASE B: CROSS-BLOCK SWAP (Different block or different face)
    const newColStartB = otherCol === 1 ? 1 : otherCol === 4 ? 3 : 2;
    if (sideB === 'BACK' && rowBaseB === 3 && newColStartB === 3) return normalized; // USPS 32

    // Place Large in Block B at newColStartB
    placeLargeAt(sideB, rowBaseB, newColStartB);

    // Get the displaced columns from Block B that Large now covers
    const displacedColB0 = getColInBlock(sideB, rowBaseB, newColStartB);
    const displacedColB1 = getColInBlock(sideB, rowBaseB, newColStartB + 1);

    // Transfer displaced columns into Block A at colStartA and colStartA + 1
    const destA0 = {
      top: normalized.find((s) => s.side === sideA && s.gridRow === rowBaseA && s.gridCol === colStartA)!,
      bot: normalized.find((s) => s.side === sideA && s.gridRow === rowBaseA + 1 && s.gridCol === colStartA)!,
    };
    const destA1 = {
      top: normalized.find((s) => s.side === sideA && s.gridRow === rowBaseA && s.gridCol === colStartA + 1)!,
      bot: normalized.find((s) => s.side === sideA && s.gridRow === rowBaseA + 1 && s.gridCol === colStartA + 1)!,
    };

    applyColToDest(displacedColB0, destA0.top, destA0.bot);
    applyColToDest(displacedColB1, destA1.top, destA1.bot);

    return normalized.map((s) => updates.get(s.slotNumber) || s);
  }

  // CASE 4: Both are MEDIUM (1x2)
  if (srcFmt === 'MEDIUM' && tgtFmt === 'MEDIUM') {
    const srcData = copyAdvertiserFields(source, target);
    const tgtData = copyAdvertiserFields(target, source);
    return normalized.map((s) => {
      if (s.slotNumber === source.slotNumber) return { ...tgtData, priceUsd: source.priceUsd || MODULAR_PRICES.MEDIUM };
      if (s.slotNumber === target.slotNumber) return { ...srcData, priceUsd: target.priceUsd || MODULAR_PRICES.MEDIUM };
      return s;
    });
  }

  // CASE 5: One is MEDIUM (1x2) and the other is SMALL (1x1)
  if (srcFmt === 'MEDIUM' || tgtFmt === 'MEDIUM') {
    const medSlot = srcFmt === 'MEDIUM' ? source : target;
    const smSlot = srcFmt === 'MEDIUM' ? target : source;

    const medCol = getColSlots(medSlot);
    const smCol = getColSlots(smSlot);

    if (!medCol.top || !medCol.bottom || !smCol.top || !smCol.bottom) return normalized;
    if (smCol.top.format === 'USPS' || smCol.bottom.format === 'USPS' || smCol.top.slotNumber === 32 || smCol.bottom.slotNumber === 32) {
      return normalized;
    }

    const medAdvertiser = copyAdvertiserFields(medSlot, smCol.top);
    const smTopAdvertiser = copyAdvertiserFields(smCol.top, medCol.top);
    const smBottomAdvertiser = copyAdvertiserFields(smCol.bottom, medCol.bottom);

    return normalized.map((s) => {
      if (s.slotNumber === smCol.top?.slotNumber) {
        return {
          ...medAdvertiser,
          format: 'MEDIUM',
          rowSpan: 2,
          colSpan: 1,
          priceUsd: medSlot.priceUsd || MODULAR_PRICES.MEDIUM,
          notes: undefined,
        };
      }
      if (s.slotNumber === smCol.bottom?.slotNumber) {
        return {
          ...s,
          format: 'MEDIUM',
          status: 'VACANT',
          businessName: undefined,
          offerHeadline: undefined,
          phone: undefined,
          notes: `Covered by slot #${smCol.top?.slotNumber}`,
        };
      }
      if (s.slotNumber === medCol.top?.slotNumber) {
        return {
          ...smTopAdvertiser,
          format: 'SMALL',
          rowSpan: 1,
          colSpan: 1,
          priceUsd: MODULAR_PRICES.SMALL,
          notes: undefined,
        };
      }
      if (s.slotNumber === medCol.bottom?.slotNumber) {
        return {
          ...smBottomAdvertiser,
          format: 'SMALL',
          rowSpan: 1,
          colSpan: 1,
          priceUsd: MODULAR_PRICES.SMALL,
          notes: undefined,
        };
      }
      return s;
    });
  }

  return normalized;
}

/**
 * Swaps two modular slots or modular groups (Small, Medium, Large) in the grid,
 * swapping formats and advertiser data across columns or quadrants, and
 * returns all slots with updated adaptive visual display numbers.
 */
export function swapModularSlots(
  sourceSlotNum: number,
  targetSlotNum: number,
  slots: SlotState[]
): SlotState[] {
  const result = internalSwapModularSlots(sourceSlotNum, targetSlotNum, slots);
  return computeAdaptiveDisplayNumbers(result);
}

/**
 * Calculates remaining milliseconds for a 72-hour reservation
 */
export function getRemainingReservationMs(slot: SlotState): number {
  if (slot.status !== 'RESERVED') return 0;
  if (!slot.reservationExpiresAt && slot.reservedAt) {
    const resDate = new Date(slot.reservedAt).getTime();
    return Math.max(0, resDate + RESERVATION_HOLD_MS - Date.now());
  }
  if (!slot.reservationExpiresAt) return RESERVATION_HOLD_MS;
  const expiresAt = new Date(slot.reservationExpiresAt).getTime();
  return Math.max(0, expiresAt - Date.now());
}

/**
 * Checks if a 72-hour reservation has expired
 */
export function isReservationExpired(slot: SlotState): boolean {
  if (slot.status !== 'RESERVED') return false;
  return getRemainingReservationMs(slot) <= 0;
}

/**
 * Formats countdown string like "71h 45m" or "Expira en 0h 12m" or "Expirado"
 */
export function formatReservationCountdown(slot: SlotState): string {
  const ms = getRemainingReservationMs(slot);
  if (ms <= 0) return 'Expirado';

  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/**
 * Calculates total gross revenue if all commercial slots sell at their base default prices:
 * - SMALL (1x1): $350
 * - MEDIUM (1x2): $650
 * - LARGE (2x2): $1,200
 */
export function computeBaseGrossRevenue(slots: SlotState[]): number {
  return slots.reduce((sum, s) => {
    if (s.format === 'USPS' || s.slotNumber === 32 || s.notes?.includes('Covered by')) return sum;
    const base = MODULAR_PRICES[s.format] || (s.rowSpan === 2 && s.colSpan === 2 ? 1200 : s.rowSpan === 2 ? 650 : 350);
    return sum + base;
  }, 0);
}

/**
 * Calculates total gross revenue from current slot prices
 */
export function computeCurrentGrossRevenue(slots: SlotState[]): number {
  return slots.reduce((sum, s) => {
    if (s.format === 'USPS' || s.slotNumber === 32 || s.notes?.includes('Covered by')) return sum;
    return sum + (s.priceUsd || 0);
  }, 0);
}

/**
 * Calculates gross margin percentage: ((revenue - cost) / revenue) * 100
 */
export function computeMarginPercent(revenue: number, operatingCost: number): number {
  if (revenue <= 0 || !Number.isFinite(revenue) || !Number.isFinite(operatingCost)) return 50;
  const margin = ((revenue - operatingCost) / revenue) * 100;
  return Math.min(95, Math.max(5, Math.round(margin)));
}

export interface ScaledPricesResult {
  pricesBySlot: Record<number, number>;
  smallPrice: number;
  mediumPrice: number;
  largePrice: number;
  scaleFactor: number;
  projectedRevenue: number;
}

/**
 * Derives proportional prices for each slot size to achieve exactly the target margin:
 * - Small  = round(350 * k)
 * - Medium = round(650 * k)
 * - Large  = round(1200 * k)
 * preserving exact proportionality across sizes.
 */
export function computeScaledPricesForMargin(
  slots: SlotState[],
  targetMarginPercent: number,
  operatingCost: number,
  roundStep = 5
): ScaledPricesResult {
  const safeMargin = Math.min(95, Math.max(5, targetMarginPercent)) / 100;
  const safeCost = Math.max(100, operatingCost);
  const requiredRevenue = safeCost / Math.max(0.05, 1 - safeMargin);
  
  const baseRevenue = computeBaseGrossRevenue(slots);
  const scaleFactor = baseRevenue > 0 ? requiredRevenue / baseRevenue : 1.0;

  const smallPrice = Math.max(50, Math.round((MODULAR_PRICES.SMALL * scaleFactor) / roundStep) * roundStep);
  const mediumPrice = Math.max(100, Math.round((MODULAR_PRICES.MEDIUM * scaleFactor) / roundStep) * roundStep);
  const largePrice = Math.max(200, Math.round((MODULAR_PRICES.LARGE * scaleFactor) / roundStep) * roundStep);

  const pricesBySlot: Record<number, number> = {};
  for (const s of slots) {
    if (s.format === 'USPS' || s.slotNumber === 32 || s.notes?.includes('Covered by')) {
      pricesBySlot[s.slotNumber] = 0;
      continue;
    }
    if (s.format === 'LARGE' || (s.rowSpan === 2 && s.colSpan === 2)) {
      pricesBySlot[s.slotNumber] = largePrice;
    } else if (s.format === 'MEDIUM' || s.rowSpan === 2) {
      pricesBySlot[s.slotNumber] = mediumPrice;
    } else {
      pricesBySlot[s.slotNumber] = smallPrice;
    }
  }

  return {
    pricesBySlot,
    smallPrice,
    mediumPrice,
    largePrice,
    scaleFactor,
    projectedRevenue: requiredRevenue,
  };
}

/**
 * Computes sequential, adaptive visual display numbers (#1, #2, #3, ...)
 * for all visible slots on the flyer in natural reading order:
 * 1. Front face: Top to bottom (gridRow 1..4), left to right (gridCol 1..4) -> #1 .. #N_front
 * 2. Back face: Top to bottom (gridRow 1..4), left to right (gridCol 1..4) -> #(N_front + 1) .. #N_total
 * (Subordinate slots covered by merged parents and USPS technical zone are excluded from commercial numbering).
 */
export function computeAdaptiveDisplayNumbers(slots: SlotState[]): SlotState[] {
  const displayMap = new Map<number, number>();

  const isFront = (s: SlotState) => s.side === 'FRONT' || (s.slotNumber <= 16 && s.side !== 'BACK');

  // Filter visible commercial slots (not covered by merged parents and not USPS)
  const visibleSlots = slots.filter(
    (s) => !s.notes?.startsWith('Covered by') && s.format !== 'USPS' && s.slotNumber !== 32
  );

  const frontVisible = visibleSlots.filter(isFront);
  const backVisible = visibleSlots.filter((s) => !isFront(s));

  const compareSlotsColumnByColumn = (a: SlotState, b: SlotState): number => {
    const rowA = a.gridRow ?? 1;
    const rowB = b.gridRow ?? 1;
    // Block 0: Top half (rows 1 & 2, above banner)
    // Block 1: Bottom half (rows 3 & 4, below banner)
    const blockA = rowA <= 2 ? 0 : 1;
    const blockB = rowB <= 2 ? 0 : 1;
    if (blockA !== blockB) return blockA - blockB;

    // Within each block, traverse column by column (left to right: col 1..4)
    const colA = a.gridCol ?? 1;
    const colB = b.gridCol ?? 1;
    if (colA !== colB) return colA - colB;

    // Within each column, traverse top to bottom (row 1 then row 2, or row 3 then row 4)
    if (rowA !== rowB) return rowA - rowB;

    return a.slotNumber - b.slotNumber;
  };

  // Sort FRONT column by column, top to bottom
  frontVisible.sort(compareSlotsColumnByColumn);

  frontVisible.forEach((slot, index) => {
    displayMap.set(slot.slotNumber, index + 1);
  });

  const nextNumber = frontVisible.length + 1;

  // Sort BACK column by column, top to bottom
  backVisible.sort(compareSlotsColumnByColumn);

  backVisible.forEach((slot, index) => {
    displayMap.set(slot.slotNumber, nextNumber + index);
  });

  return slots.map((s) => ({
    ...s,
    displayNumber: displayMap.get(s.slotNumber),
  }));
}

/**
 * Returns the adaptive visual display number for a slot, falling back to slotNumber
 */
export function getSlotDisplayNumber(slot: SlotState, allSlots?: SlotState[]): number {
  if (slot.displayNumber !== undefined) return slot.displayNumber;
  if (!allSlots || allSlots.length === 0) return slot.slotNumber;
  const computed = computeAdaptiveDisplayNumbers(allSlots);
  const match = computed.find((s) => s.slotNumber === slot.slotNumber);
  return match?.displayNumber ?? slot.slotNumber;
}

