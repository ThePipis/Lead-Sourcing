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
      const format: SlotFormat =
        existing.format ||
        (existing.rowSpan === 2 && existing.colSpan === 2 ? 'LARGE' : existing.rowSpan === 2 ? 'MEDIUM' : 'SMALL');
      const basePrice = MODULAR_PRICES[format] || (format === 'LARGE' ? 1200 : format === 'MEDIUM' ? 650 : 350);

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

  // Origin can be (row 1, col 1), (row 1, col 3), (row 3, col 1), (row 3, col 3)
  const validRows = [1, 3];
  const validCols = [1, 3];
  if (!validRows.includes(slot.gridRow) || !validCols.includes(slot.gridCol)) return false;

  const r = slot.gridRow;
  const c = slot.gridCol;

  // Check 4 cells in the 2x2 box: (r, c), (r+1, c), (r, c+1), (r+1, c+1)
  const required = [
    { row: r, col: c },
    { row: r + 1, col: c },
    { row: r, col: c + 1 },
    { row: r + 1, col: c + 1 },
  ];

  for (const req of required) {
    const target = slots.find((s) => s.side === slot.side && s.gridRow === req.row && s.gridCol === req.col);
    if (!target) return false;
    if (target.format === 'USPS') return false;
    if (target.slotNumber !== slot.slotNumber) {
      if (target.status === 'PAID') return false;
      if (target.format === 'MEDIUM' || target.format === 'LARGE' || target.notes?.startsWith('Covered by')) return false;
    }
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
    const originRow = row % 2 === 1 ? row : row - 1;
    const originCol = col % 2 === 1 ? col : col - 1;

    const coveredCoords = [
      { r: originRow, c: originCol },
      { r: originRow + 1, c: originCol },
      { r: originRow, c: originCol + 1 },
      { r: originRow + 1, c: originCol + 1 },
    ];

    return normalized.map((s) => {
      if (s.slotNumber === primarySlotNum) {
        return {
          ...s,
          format: 'LARGE',
          rowSpan: 2,
          colSpan: 2,
          gridRow: originRow,
          gridCol: originCol,
          priceUsd: MODULAR_PRICES.LARGE,
        };
      }
      const isCovered = coveredCoords.some((coord) => s.side === side && s.gridRow === coord.r && s.gridCol === coord.c);
      if (isCovered && s.slotNumber !== primarySlotNum) {
        return {
          ...s,
          status: 'VACANT',
          notes: `Covered by large slot #${primarySlotNum}`,
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
      return {
        ...s,
        format: 'SMALL',
        rowSpan: 1,
        colSpan: 1,
        gridRow: def?.gridRow ?? s.gridRow,
        gridCol: def?.gridCol ?? s.gridCol,
        priceUsd: MODULAR_PRICES.SMALL,
      };
    }
    if (s.notes?.includes(`Covered by`) && s.notes?.includes(`#${primarySlotNum}`)) {
      const def = MODULAR_GRID_DEFS.find((d) => d.slotNumber === s.slotNumber);
      return {
        ...s,
        format: 'SMALL',
        rowSpan: 1,
        colSpan: 1,
        gridRow: def?.gridRow ?? s.gridRow,
        gridCol: def?.gridCol ?? s.gridCol,
        status: 'VACANT',
        priceUsd: MODULAR_PRICES.SMALL,
        notes: undefined,
      };
    }
    return s;
  });
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

