import { SlotState, SlotFormat, CardSide } from '../types.ts';
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

  return MODULAR_GRID_DEFS.map((def) => {
    const existing = mapByNumber.get(def.slotNumber);
    const cat = CLOSED_CATEGORIES.find((c) => c.id === def.categoryId) ?? CLOSED_CATEGORIES[0];

    if (def.isUspsZone) {
      return {
        slotNumber: 32,
        categoryId: 32,
        categoryName: 'USPS EDDM Technical Zone',
        status: 'PAID',
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
      // Check if any partner slot mentions being covered by this slot
      const coversAny = existingSlots.filter((s) => s.notes?.includes(`#${def.slotNumber}`));
      const isCoveringLarge =
        coversAny.length >= 2 ||
        coversAny.some(
          (s) =>
            s.notes?.toLowerCase().includes('large') ||
            s.notes?.toLowerCase().includes('grande'),
        );

      let format: SlotFormat = existing.format;
      if (!format || format === 'SMALL') {
        if (
          (existing.rowSpan === 2 && existing.colSpan === 2) ||
          isCoveringLarge ||
          existing.priceUsd === 1200
        ) {
          format = 'LARGE';
        } else if (existing.rowSpan === 2 || coversAny.length === 1 || existing.priceUsd === 650) {
          format = 'MEDIUM';
        } else {
          format = 'SMALL';
        }
      }

      const rowSpan = format === 'LARGE' || format === 'MEDIUM' ? 2 : 1;
      const colSpan = format === 'LARGE' ? 2 : 1;

      const priceUsd =
        format === 'MEDIUM'
          ? (existing.priceUsd && existing.priceUsd > 350 ? existing.priceUsd : 650)
          : format === 'LARGE'
          ? (existing.priceUsd && existing.priceUsd > 350 ? existing.priceUsd : 1200)
          : (existing.priceUsd || 350);

      return {
        ...existing,
        format,
        side: def.side,
        gridRow: def.gridRow,
        gridCol: def.gridCol,
        rowSpan,
        colSpan,
        priceUsd,
        categoryName: existing.categoryName || cat.name,
        offerHeadline: existing.offerHeadline || cat.defaultHeadline,
      };
    }

    // Default new vacant slot
    return {
      slotNumber: def.slotNumber,
      categoryId: def.categoryId,
      categoryName: cat.name,
      status: 'VACANT',
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

/**
 * Checks if a slot can be expanded into a LARGE (2x2) quadrant
 */
export function canMergeLarge(slot: SlotState, slots: SlotState[]): boolean {
  if (slot.format === 'LARGE' || slot.format === 'USPS') return false;
  if (!slot.gridRow || !slot.gridCol) return false;
  if (slot.notes?.startsWith('Covered by')) return false;

  const originRow = slot.gridRow <= 2 ? 1 : 3;
  const originCol = slot.gridCol <= 2 ? 1 : 3;

  const quadrantSlots = slots.filter(
    (s) =>
      s.side === slot.side &&
      ((s.gridRow ?? 1) === originRow || (s.gridRow ?? 1) === originRow + 1) &&
      ((s.gridCol ?? 1) === originCol || (s.gridCol ?? 1) === originCol + 1)
  );

  if (quadrantSlots.length < 4) return false;

  // Cannot contain USPS technical zone
  if (quadrantSlots.some((s) => s.format === 'USPS' || s.slotNumber === 32)) {
    return false;
  }

  // Cannot already be Large
  if (quadrantSlots.some((s) => s.format === 'LARGE' || (s.rowSpan === 2 && s.colSpan === 2))) {
    return false;
  }

  // Cannot merge if any other slot is PAID
  if (quadrantSlots.some((s) => s.status === 'PAID')) {
    return false;
  }

  // At most one distinct active client in the quadrant
  const activeBusinesses = new Set(
    quadrantSlots
      .filter((s) => s.businessName && s.status !== 'VACANT')
      .map((s) => s.businessName?.trim().toLowerCase())
  );
  if (activeBusinesses.size > 1) {
    return false;
  }

  return true;
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

    return normalized.map((s) => {
      if (s.slotNumber === primarySlotNum) {
        return {
          ...s,
          format: 'MEDIUM',
          rowSpan: 2,
          colSpan: 1,
          priceUsd: MODULAR_PRICES.MEDIUM,
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
    });
  }

  if (targetFormat === 'LARGE') {
    const originRow = row <= 2 ? 1 : 3;
    const originCol = col <= 2 ? 1 : 3;

    const coveredCoords = [
      { r: originRow, c: originCol },
      { r: originRow + 1, c: originCol },
      { r: originRow, c: originCol + 1 },
      { r: originRow + 1, c: originCol + 1 },
    ];

    // Find the top-left slot in this quadrant to serve as the anchor for the 2x2 grid
    const anchorSlot = normalized.find(
      (s) => s.side === side && s.gridRow === originRow && s.gridCol === originCol
    ) ?? primary;

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

    return normalized.map((s) => {
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
          priceUsd: MODULAR_PRICES.LARGE,
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
    });
  }

  return normalized;
}

/**
 * Splits a merged MEDIUM or LARGE slot back into atomic SMALL ($350) slots
 */
export function splitModularSlot(primarySlotNum: number, slots: SlotState[]): SlotState[] {
  const normalized = normalizeModularSlots(slots);
  const primary = normalized.find((s) => s.slotNumber === primarySlotNum);
  if (!primary) return normalized;

  return normalized.map((s) => {
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
        priceUsd: MODULAR_PRICES.SMALL,
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
        priceUsd: MODULAR_PRICES.SMALL,
        categoryName: cat?.name ?? s.categoryName,
        offerHeadline: cat?.defaultHeadline ?? s.offerHeadline,
        notes: undefined,
      };
    }
    return s;
  });
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
export function swapModularSlots(
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

    const rowBaseA = (lgSlot.gridRow ?? 1) <= 2 ? 1 : 3;
    const colBaseA = (lgSlot.gridCol ?? 1) <= 2 ? 1 : 3;
    const sideA = lgSlot.side;

    const rowBaseB = (otherSlot.gridRow ?? 1) <= 2 ? 1 : 3;
    const colBaseB = (otherSlot.gridCol ?? 1) <= 2 ? 1 : 3;
    const sideB = otherSlot.side;

    // Disallow if targeting same quadrant
    if (sideA === sideB && rowBaseA === rowBaseB && colBaseA === colBaseB) {
      return normalized;
    }

    const otherQuad = normalized.filter(
      (item) =>
        item.side === sideB &&
        ((item.gridRow ?? 1) === rowBaseB || (item.gridRow ?? 1) === rowBaseB + 1) &&
        ((item.gridCol ?? 1) === colBaseB || (item.gridCol ?? 1) === colBaseB + 1)
    );

    // Disallow if other quadrant contains USPS zone
    if (otherQuad.some((s) => s.format === 'USPS' || s.slotNumber === 32)) {
      return normalized;
    }

    // Cells in Quadrant A (where Large slot currently is)
    const cellA_00 = normalized.find((s) => s.side === sideA && s.gridRow === rowBaseA && s.gridCol === colBaseA);
    const cellA_10 = normalized.find((s) => s.side === sideA && s.gridRow === rowBaseA + 1 && s.gridCol === colBaseA);
    const cellA_01 = normalized.find((s) => s.side === sideA && s.gridRow === rowBaseA && s.gridCol === colBaseA + 1);
    const cellA_11 = normalized.find((s) => s.side === sideA && s.gridRow === rowBaseA + 1 && s.gridCol === colBaseA + 1);

    // Cells in Quadrant B (where other slot currently is)
    const cellB_00 = normalized.find((s) => s.side === sideB && s.gridRow === rowBaseB && s.gridCol === colBaseB);
    const cellB_10 = normalized.find((s) => s.side === sideB && s.gridRow === rowBaseB + 1 && s.gridCol === colBaseB);
    const cellB_01 = normalized.find((s) => s.side === sideB && s.gridRow === rowBaseB && s.gridCol === colBaseB + 1);
    const cellB_11 = normalized.find((s) => s.side === sideB && s.gridRow === rowBaseB + 1 && s.gridCol === colBaseB + 1);

    if (!cellA_00 || !cellA_10 || !cellA_01 || !cellA_11 || !cellB_00 || !cellB_10 || !cellB_01 || !cellB_11) {
      return normalized;
    }

    const col0BIsMed = cellB_00.format === 'MEDIUM';
    const col1BIsMed = cellB_01.format === 'MEDIUM';

    // Check if otherSlot was in column 1 of Quadrant B
    const otherIsInCol1 = otherSlot.gridCol === colBaseB + 1;

    // The column containing otherSlot maps to Column 0 of Quadrant A (anchor slot cellA_00),
    // and the other column of Quadrant B maps to Column 1 of Quadrant A
    const srcColForA0 = otherIsInCol1 ? { top: cellB_01, bot: cellB_11, isMed: col1BIsMed } : { top: cellB_00, bot: cellB_10, isMed: col0BIsMed };
    const srcColForA1 = otherIsInCol1 ? { top: cellB_00, bot: cellB_10, isMed: col0BIsMed } : { top: cellB_01, bot: cellB_11, isMed: col1BIsMed };

    const updates = new Map<number, SlotState>();

    // 1. Quadrant B gets the LARGE slot anchored at cellB_00
    const lgAdvertiser = copyAdvertiserFields(lgSlot, cellB_00);
    updates.set(cellB_00.slotNumber, {
      ...lgAdvertiser,
      format: 'LARGE',
      rowSpan: 2,
      colSpan: 2,
      priceUsd: lgSlot.priceUsd || MODULAR_PRICES.LARGE,
      notes: undefined,
    });

    const lgCoveredNotes = `Covered by large slot #${cellB_00.slotNumber}`;
    [cellB_10, cellB_01, cellB_11].forEach((cov) => {
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

    // 2. Column 0 of Quadrant A receives srcColForA0
    if (srcColForA0.isMed) {
      const medData = copyAdvertiserFields(srcColForA0.top, cellA_00);
      updates.set(cellA_00.slotNumber, {
        ...medData,
        format: 'MEDIUM',
        rowSpan: 2,
        colSpan: 1,
        priceUsd: srcColForA0.top.priceUsd || MODULAR_PRICES.MEDIUM,
        notes: undefined,
      });
      updates.set(cellA_10.slotNumber, {
        ...cellA_10,
        format: 'MEDIUM',
        status: 'VACANT',
        businessName: undefined,
        offerHeadline: undefined,
        phone: undefined,
        notes: `Covered by slot #${cellA_00.slotNumber}`,
      });
    } else {
      const smTopData = copyAdvertiserFields(srcColForA0.top, cellA_00);
      const smBotData = copyAdvertiserFields(srcColForA0.bot, cellA_10);
      updates.set(cellA_00.slotNumber, {
        ...smTopData,
        format: 'SMALL',
        rowSpan: 1,
        colSpan: 1,
        priceUsd: srcColForA0.top.priceUsd || MODULAR_PRICES.SMALL,
        notes: undefined,
      });
      updates.set(cellA_10.slotNumber, {
        ...smBotData,
        format: 'SMALL',
        rowSpan: 1,
        colSpan: 1,
        priceUsd: srcColForA0.bot.priceUsd || MODULAR_PRICES.SMALL,
        notes: undefined,
      });
    }

    // 3. Column 1 of Quadrant A receives srcColForA1
    if (srcColForA1.isMed) {
      const medData = copyAdvertiserFields(srcColForA1.top, cellA_01);
      updates.set(cellA_01.slotNumber, {
        ...medData,
        format: 'MEDIUM',
        rowSpan: 2,
        colSpan: 1,
        priceUsd: srcColForA1.top.priceUsd || MODULAR_PRICES.MEDIUM,
        notes: undefined,
      });
      updates.set(cellA_11.slotNumber, {
        ...cellA_11,
        format: 'MEDIUM',
        status: 'VACANT',
        businessName: undefined,
        offerHeadline: undefined,
        phone: undefined,
        notes: `Covered by slot #${cellA_01.slotNumber}`,
      });
    } else {
      const smTopData = copyAdvertiserFields(srcColForA1.top, cellA_01);
      const smBotData = copyAdvertiserFields(srcColForA1.bot, cellA_11);
      updates.set(cellA_01.slotNumber, {
        ...smTopData,
        format: 'SMALL',
        rowSpan: 1,
        colSpan: 1,
        priceUsd: srcColForA1.top.priceUsd || MODULAR_PRICES.SMALL,
        notes: undefined,
      });
      updates.set(cellA_11.slotNumber, {
        ...smBotData,
        format: 'SMALL',
        rowSpan: 1,
        colSpan: 1,
        priceUsd: srcColForA1.bot.priceUsd || MODULAR_PRICES.SMALL,
        notes: undefined,
      });
    }

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

