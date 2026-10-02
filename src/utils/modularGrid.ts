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

// Flat $50 off every list price while the 72h hold is active.
export const RESERVATION_72H_DISCOUNTS: Record<SlotFormat, number> = {
  SMALL: 50,
  MEDIUM: 50,
  LARGE: 50,
  USPS: 0,
};

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

      const isCovered = Boolean(notes?.includes('Covered by'));
      const rowSpan = isCovered ? 1 : format === 'LARGE' || format === 'MEDIUM' ? 2 : 1;
      const colSpan = isCovered ? 1 : format === 'LARGE' ? 2 : 1;

      const defaultPrice = isCovered
        ? 0
        : MODULAR_PRICES[format] || (format === 'LARGE' ? 1200 : format === 'MEDIUM' ? 650 : 350);
      const priceUsd = isCovered
        ? 0
        : typeof existing.priceUsd === 'number' && !isNaN(existing.priceUsd) && existing.priceUsd > 0
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
        status: isCovered ? ('VACANT' as SlotStatus) : existing.status,
        businessName: isCovered ? undefined : existing.businessName,
        contactPerson: isCovered ? undefined : existing.contactPerson,
        phone: isCovered ? undefined : existing.phone,
        email: isCovered ? undefined : existing.email,
        website: isCovered ? undefined : existing.website,
        amountCollectedUsd: isCovered ? undefined : existing.amountCollectedUsd,
        paidAt: isCovered ? undefined : existing.paidAt,
        paymentRef: isCovered ? undefined : existing.paymentRef,
        categoryName: existing.categoryName || cat.name,
        offerHeadline: isCovered ? undefined : (existing.offerHeadline || cat.defaultHeadline),
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
 * A cell can be swallowed by a slot's merge only if it is free, or already belongs
 * to the same business. Absorbing another client's cell would erase their sale.
 */
function isAbsorbable(cell: SlotState, owner: SlotState): boolean {
  if (cell.status === 'VACANT') return true;
  const own = owner.businessName?.trim().toLowerCase();
  return Boolean(own) && cell.businessName?.trim().toLowerCase() === own;
}

/**
 * Finds a column that can host this slot as a MEDIUM (1x2) when it cannot grow in place:
 * the Mediano goes into that column and that column's top cell moves into this slot's cell.
 * Columns to the right are tried first (left-to-right negotiation order); a bottom slot with
 * nothing free to its right may still grow upward in its own column if the cell above is free;
 * columns to the left come last, for a slot at the right edge (e.g. above the USPS zone).
 */
export function findBottomSlotMediumTarget(
  slot: SlotState,
  slots: SlotState[]
): { targetCol: number; destTop: SlotState; destBottom: SlotState } | null {
  if (slot.format === 'MEDIUM' || slot.format === 'LARGE' || slot.format === 'USPS' || slot.slotNumber === 32) return null;
  if (slot.notes?.startsWith('Covered by')) return null;
  if (slot.status === 'PAID') return null;

  const def = MODULAR_GRID_DEFS.find((d) => d.slotNumber === slot.slotNumber);
  const row = slot.gridRow ?? def?.gridRow;
  const col = slot.gridCol ?? def?.gridCol;
  const side = slot.side ?? def?.side;
  if (!row || !col) return null;

  const isBottom = row === 2 || row === 4;
  const rowTop = isBottom ? row - 1 : row;
  const candidateCols = [1, 2, 3, 4].filter((c) => c > col);
  if (isBottom) candidateCols.push(col);
  for (let c = col - 1; c >= 1; c--) candidateCols.push(c);

  for (const candCol of candidateCols) {
    const candTop = slots.find((s) => {
      const d = MODULAR_GRID_DEFS.find((item) => item.slotNumber === s.slotNumber);
      const sr = s.gridRow ?? d?.gridRow;
      const sc = s.gridCol ?? d?.gridCol;
      const ss = s.side ?? d?.side;
      return ss === side && sr === rowTop && sc === candCol;
    });

    const candBottom = slots.find((s) => {
      const d = MODULAR_GRID_DEFS.find((item) => item.slotNumber === s.slotNumber);
      const sr = s.gridRow ?? d?.gridRow;
      const sc = s.gridCol ?? d?.gridCol;
      const ss = s.side ?? d?.side;
      return ss === side && sr === rowTop + 1 && sc === candCol;
    });

    if (!candTop || !candBottom) continue;

    // Growing upward in place: the slot itself becomes the covered half and the cell above
    // takes its data, so that cell is overwritten and must be free.
    if (candCol === col) {
      if (candTop.format !== 'SMALL' || candTop.notes?.startsWith('Covered by')) continue;
      if (!isAbsorbable(candTop, slot)) continue;
      return { targetCol: candCol, destTop: candTop, destBottom: candBottom };
    }

    // Cannot involve USPS technical zone
    if (candTop.format === 'USPS' || candTop.slotNumber === 32 || candBottom.format === 'USPS' || candBottom.slotNumber === 32) continue;

    // Both must be atomic SMALL slots (cannot destroy already merged MEDIUM or LARGE slots)
    if (candTop.format === 'MEDIUM' || candTop.format === 'LARGE' || candTop.notes?.startsWith('Covered by')) continue;
    if (candBottom.format === 'MEDIUM' || candBottom.format === 'LARGE' || candBottom.notes?.startsWith('Covered by')) continue;

    // candTop will be moved to (row, col) as an atomic chico, so it cannot be PAID
    if (candTop.status === 'PAID') continue;

    // candBottom will be absorbed as the covered partner of the Mediano in candCol, so it must be VACANT
    if (candBottom.status !== 'VACANT' || (candBottom.businessName && candBottom.businessName.trim() !== '')) continue;

    return { targetCol: candCol, destTop: candTop, destBottom: candBottom };
  }

  return null;
}

/**
 * True when a top slot (row 1 or 3) can grow downward in place: the cell below is a free chico.
 */
function canGrowDownInPlace(slot: SlotState, slots: SlotState[]): boolean {
  const def = MODULAR_GRID_DEFS.find((d) => d.slotNumber === slot.slotNumber);
  const row = slot.gridRow ?? def?.gridRow;
  const col = slot.gridCol ?? def?.gridCol;
  const side = slot.side ?? def?.side;
  if (row !== 1 && row !== 3) return false;
  const partner = slots.find((s) => {
    const d = MODULAR_GRID_DEFS.find((item) => item.slotNumber === s.slotNumber);
    return (s.side ?? d?.side) === side && (s.gridCol ?? d?.gridCol) === col && (s.gridRow ?? d?.gridRow) === row + 1;
  });
  if (!partner) return false;
  if (partner.format === 'USPS' || partner.format === 'LARGE' || partner.format === 'MEDIUM') return false;
  if (partner.notes?.startsWith('Covered by')) return false;
  return isAbsorbable(partner, slot);
}

/**
 * Checks if a slot can be merged vertically into a MEDIUM (1x2) slot.
 * - Top slots (rows 1 & 3): grow downward in place; if the cell below is taken,
 *   relocate to the next free column to the right.
 * - Bottom slots (rows 2 & 4): relocate to the next free column to the right,
 *   or grow upward in place when nothing to the right is free.
 */
export function canMergeVertical(slot: SlotState, slots: SlotState[]): boolean {
  if (slot.format === 'MEDIUM' || slot.format === 'LARGE' || slot.format === 'USPS') return false;
  if (!(slot.gridRow ?? MODULAR_GRID_DEFS.find((d) => d.slotNumber === slot.slotNumber)?.gridRow)) return false;
  if (slot.notes?.startsWith('Covered by')) return false;
  if (slot.status === 'PAID') return false;

  return canGrowDownInPlace(slot, slots) || findBottomSlotMediumTarget(slot, slots) !== null;
}

export interface LargeOriginCandidate {
  originRow: number;
  originCol: number;
  coveredCoords: { r: number; c: number }[];
  anchorSlot: SlotState;
  /** True when the 2x2 sits in a free block to the right instead of around the slot itself. */
  relocated: boolean;
  /** Unpaid clients inside the block, each moved to a free chico outside it. */
  moves: { from: SlotState; to: SlotState }[];
  /** Medianos inside the block, each moved whole onto a column of two free chicos. */
  mediumMoves: { from: SlotState; top: SlotState; bottom: SlotState }[];
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
  // Same rule as the Mediano: if no block around the slot is free, a chico may move its
  // Grande into the next free block to the right, or else to the left.
  if (slot.format === 'SMALL') {
    for (let c = col + 1; c <= 3; c++) candidateCols.push(c);
    for (let c = col - 2; c >= 1; c--) candidateCols.push(c);
  }

  // First pass: a block with no other client in it. Second pass: a block whose unpaid
  // clients can each be moved to a free chico elsewhere on the face, so five empty
  // boxes are not left unusable because one prospect sits in the only 2x2.
  for (const allowMoves of [false, true]) {
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

      // 4. Never destroy another merged slot. A Mediano is the operator's decision
      // (the chico is the minimum unit), so one inside the block is moved whole onto
      // a column of two free chicos instead of being absorbed. A Mediano always spans
      // both rows of its block, so if its top is inside, its covered half is too.
      const ownerOf = (s: SlotState) => Number(s.notes?.match(/#(\d+)/)?.[1]);
      const otherMediums = quadrantSlots.filter(
        (s) => s.slotNumber !== slot.slotNumber && s.format === 'MEDIUM' && !s.notes,
      );
      const strayCovered = quadrantSlots.some(
        (s) =>
          s.notes?.startsWith('Covered by') &&
          ownerOf(s) !== slot.slotNumber &&
          !otherMediums.some((m) => m.slotNumber === ownerOf(s)),
      );
      if (strayCovered) continue;
      if (otherMediums.length > 0 && !allowMoves) continue;

      // Anchor slot is the top-left slot of this 2x2
      const anchorSlot =
        quadrantSlots.find((s) => s.gridRow === originRow && s.gridCol === candCol) ?? slot;
      const relocated = !coveredCoords.some((c) => c.r === slot.gridRow && c.c === slot.gridCol);
      // A relocated Grande gives its anchor's client the clicked cell as a chico; a
      // Mediano anchor cannot shrink into it.
      if (relocated && otherMediums.some((m) => m.slotNumber === anchorSlot.slotNumber)) continue;

      const inQuadrant = (s: SlotState) => coveredCoords.some((c) => c.r === s.gridRow && c.c === s.gridCol);
      const isFreeChico = (s?: SlotState) =>
        !!s &&
        s.side === slot.side &&
        s.slotNumber !== slot.slotNumber &&
        s.slotNumber !== 32 &&
        s.format === 'SMALL' &&
        s.status === 'VACANT' &&
        !s.businessName?.trim() &&
        !s.notes?.startsWith('Covered by') &&
        !inQuadrant(s);
      const used = new Set<number>();
      const mediumMoves: LargeOriginCandidate['mediumMoves'] = [];
      for (const m of otherMediums) {
        const columns = slots
          .filter((t) => isFreeChico(t) && !used.has(t.slotNumber) && (t.gridRow === 1 || t.gridRow === 3))
          .map((top) => ({
            top,
            bottom: slots.find(
              (b) => b.side === slot.side && b.gridRow === (top.gridRow ?? 0) + 1 && b.gridCol === top.gridCol,
            ),
          }))
          .filter((c) => isFreeChico(c.bottom) && !used.has(c.bottom!.slotNumber))
          .sort(
            (x, y) =>
              (x.top.gridRow === originRow ? 0 : 1) - (y.top.gridRow === originRow ? 0 : 1) ||
              Math.abs((x.top.gridCol ?? 0) - (m.gridCol ?? 0)) - Math.abs((y.top.gridCol ?? 0) - (m.gridCol ?? 0)),
          );
        const dest = columns[0];
        if (!dest) break;
        used.add(dest.top.slotNumber);
        used.add(dest.bottom!.slotNumber);
        mediumMoves.push({ from: m, top: dest.top, bottom: dest.bottom! });
      }
      if (mediumMoves.length < otherMediums.length) continue;

      // 5. Every other cell must be free or already this slot's business: the old
      // "at most one business" rule let a vacant slot swallow a neighbour's client
      // and take over its name. A relocated Grande hands its anchor's client the
      // clicked slot's cell, so that one never needs a free box.
      const displaced = quadrantSlots.filter(
        (s) =>
          s.slotNumber !== slot.slotNumber &&
          !isAbsorbable(s, slot) &&
          !otherMediums.some((m) => m.slotNumber === s.slotNumber) &&
          !(relocated && s.slotNumber === anchorSlot.slotNumber),
      );
      if (displaced.length > 0 && !allowMoves) continue;

      const freeCells = slots
        .filter((s) => isFreeChico(s) && !used.has(s.slotNumber))
        .sort((a, b) => {
          const inBlock = (s: SlotState) => ((s.gridRow ?? 0) >= originRow && (s.gridRow ?? 0) <= originRow + 1 ? 0 : 1);
          return inBlock(a) - inBlock(b) || (a.gridRow ?? 0) - (b.gridRow ?? 0) || (a.gridCol ?? 0) - (b.gridCol ?? 0);
        });
      if (displaced.length > freeCells.length) continue;

      return {
        originRow,
        originCol: candCol,
        coveredCoords,
        anchorSlot,
        relocated,
        moves: displaced.map((from, i) => ({ from, to: freeCells[i] })),
        mediumMoves,
      };
    }
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
    // -------------------------------------------------------------
    // SUB-CASE 1: TOP SLOT (gridRow === 1 or 3)
    // Merges downward with partner in the same column
    // -------------------------------------------------------------
    if ((row === 1 || row === 3) && canGrowDownInPlace(primary, normalized)) {
      const partnerRow = row + 1;
      const partner = normalized.find(
        (s) => s.side === side && s.gridCol === col && s.gridRow === partnerRow && s.slotNumber !== primarySlotNum
      );
      const existingMed = normalized.find((s) => s.format === 'MEDIUM' && s.priceUsd && s.slotNumber !== 32);
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
            rowSpan: 1,
            colSpan: 1,
            status: 'VACANT',
            priceUsd: 0,
            businessName: undefined,
            contactPerson: undefined,
            phone: undefined,
            email: undefined,
            website: undefined,
            logoUrl: undefined,
            offerHeadline: undefined,
            amountCollectedUsd: undefined,
            paidAt: undefined,
            paymentRef: undefined,
            notes: `Covered by slot #${primarySlotNum}`,
          };
        }
        return s;
      }));
    }

    // -------------------------------------------------------------
    // SUB-CASE 2: RELOCATION (bottom slot, or top slot whose cell below is taken)
    // Swaps with top slot of the next available column to the right,
    // placing the Mediano in that column and keeping the chico in this row
    // -------------------------------------------------------------
    {
      const target = findBottomSlotMediumTarget(primary, normalized);
      if (!target) return normalized;

      const { destTop, destBottom } = target;
      const existingMed = normalized.find((s) => s.format === 'MEDIUM' && s.priceUsd && s.slotNumber !== 32);
      const medPrice = existingMed?.priceUsd ?? (primary.priceUsd ? Math.round((primary.priceUsd * 650) / 350 / 5) * 5 : MODULAR_PRICES.MEDIUM);

      const existingSmall = normalized.find((s) => s.format === 'SMALL' && s.priceUsd && s.slotNumber !== 32);
      const activeSmallPrice = existingSmall?.priceUsd ?? MODULAR_PRICES.SMALL;

      // Copy primary advertiser data into destTop
      const primaryData = {
        categoryId: primary.categoryId,
        categoryName: primary.categoryName,
        businessName: primary.businessName,
        contactPerson: primary.contactPerson,
        phone: primary.phone,
        email: primary.email,
        website: primary.website,
        status: primary.status,
        logoUrl: primary.logoUrl,
        offerHeadline: primary.offerHeadline,
        avgTicketUsd: primary.avgTicketUsd,
        paymentRef: primary.paymentRef,
        paidAt: primary.paidAt,
        amountCollectedUsd: primary.amountCollectedUsd,
        scanCount: primary.scanCount,
        reservedAt: primary.reservedAt,
        reservationExpiresAt: primary.reservationExpiresAt,
      };

      // destTop data
      const hasDestData = Boolean(destTop.businessName && destTop.status !== 'VACANT');
      const destData = {
        categoryId: destTop.categoryId,
        categoryName: destTop.categoryName,
        businessName: destTop.businessName,
        contactPerson: destTop.contactPerson,
        phone: destTop.phone,
        email: destTop.email,
        website: destTop.website,
        status: destTop.status,
        logoUrl: destTop.logoUrl,
        offerHeadline: destTop.offerHeadline,
        avgTicketUsd: destTop.avgTicketUsd,
        paymentRef: destTop.paymentRef,
        paidAt: destTop.paidAt,
        amountCollectedUsd: destTop.amountCollectedUsd,
        scanCount: destTop.scanCount,
        reservedAt: destTop.reservedAt,
        reservationExpiresAt: destTop.reservationExpiresAt,
      };

      const primaryDef = MODULAR_GRID_DEFS.find((d) => d.slotNumber === primary.slotNumber);
      const primaryDefaultCat = CLOSED_CATEGORIES.find((c) => c.id === primaryDef?.categoryId);
      const destDef = MODULAR_GRID_DEFS.find((d) => d.slotNumber === destTop.slotNumber);
      const destCat = CLOSED_CATEGORIES.find((c) => c.id === destDef?.categoryId);

      return computeAdaptiveDisplayNumbers(normalized.map((s) => {
        // 1. destTop becomes the MEDIUM slot with primary's data
        if (s.slotNumber === destTop.slotNumber) {
          return {
            ...s,
            ...primaryData,
            format: 'MEDIUM',
            rowSpan: 2,
            colSpan: 1,
            priceUsd: medPrice,
            notes: undefined,
          };
        }

        // 2. destBottom is absorbed under destTop
        if (s.slotNumber === destBottom.slotNumber) {
          return {
            ...s,
            format: 'MEDIUM',
            rowSpan: 1,
            colSpan: 1,
            status: 'VACANT',
            priceUsd: 0,
            businessName: undefined,
            contactPerson: undefined,
            phone: undefined,
            email: undefined,
            website: undefined,
            logoUrl: undefined,
            offerHeadline: undefined,
            amountCollectedUsd: undefined,
            paidAt: undefined,
            paymentRef: undefined,
            notes: `Covered by slot #${destTop.slotNumber}`,
          };
        }

        // 3. primary slot (at row, col) receives destTop's data (or destTop's category if vacant)
        if (s.slotNumber === primary.slotNumber) {
          if (hasDestData) {
            return {
              ...s,
              ...destData,
              format: 'SMALL',
              rowSpan: 1,
              colSpan: 1,
              priceUsd: activeSmallPrice,
              notes: undefined,
            };
          }
          return {
            ...s,
            format: 'SMALL',
            rowSpan: 1,
            colSpan: 1,
            status: 'VACANT',
            businessName: undefined,
            contactPerson: undefined,
            phone: undefined,
            email: undefined,
            website: undefined,
            logoUrl: undefined,
            categoryId: destCat?.id ?? primaryDefaultCat?.id ?? s.categoryId,
            categoryName: destCat?.name ?? primaryDefaultCat?.name ?? s.categoryName,
            offerHeadline: destCat?.defaultHeadline ?? primaryDefaultCat?.defaultHeadline ?? s.offerHeadline,
            priceUsd: activeSmallPrice,
            notes: undefined,
          };
        }

        return s;
      }));
    }
  }

  if (targetFormat === 'LARGE') {
    const origin = findBestLargeOrigin(primary, normalized);
    if (!origin) return normalized;

    const { originRow, originCol, coveredCoords, anchorSlot } = origin;

    // The slot the operator clicked keeps its category and client: findBestLargeOrigin
    // only takes free cells or this business, and moves any other unpaid client out.
    const slotWithData = primary;

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
          reservedAt: slotWithData.reservedAt,
          reservationExpiresAt: slotWithData.reservationExpiresAt,
          format: 'LARGE',
          rowSpan: 2,
          colSpan: 2,
          gridRow: originRow,
          gridCol: originCol,
          priceUsd: lgPrice,
          notes: undefined,
        };
      }
      // Relocated Grande: the clicked chico stays where it was and takes over the anchor's
      // category, so no category disappears from the card beyond the three covered cells.
      if (origin.relocated && s.slotNumber === primary.slotNumber) {
        return {
          ...copyAdvertiserFields(anchorSlot, s),
          format: 'SMALL',
          rowSpan: 1,
          colSpan: 1,
          priceUsd: primary.priceUsd || MODULAR_PRICES.SMALL,
          notes: undefined,
        };
      }
      // A Mediano inside the block lands whole on a column of two free chicos.
      const medTop = origin.mediumMoves.find((m) => m.top.slotNumber === s.slotNumber);
      if (medTop) {
        return {
          ...copyAdvertiserFields(medTop.from, s),
          format: 'MEDIUM',
          rowSpan: 2,
          colSpan: 1,
          priceUsd: medTop.from.priceUsd,
          notes: undefined,
        };
      }
      const medBottom = origin.mediumMoves.find((m) => m.bottom.slotNumber === s.slotNumber);
      if (medBottom) {
        return {
          ...s,
          format: 'MEDIUM',
          rowSpan: 1,
          colSpan: 1,
          status: 'VACANT',
          priceUsd: 0,
          businessName: undefined,
          contactPerson: undefined,
          phone: undefined,
          email: undefined,
          website: undefined,
          logoUrl: undefined,
          offerHeadline: undefined,
          amountCollectedUsd: undefined,
          paidAt: undefined,
          paymentRef: undefined,
          notes: `Covered by slot #${medBottom.top.slotNumber}`,
        };
      }
      // An unpaid client displaced from the block keeps its data in a free chico.
      const move = origin.moves.find((m) => m.to.slotNumber === s.slotNumber);
      if (move) {
        return {
          ...copyAdvertiserFields(move.from, s),
          format: 'SMALL',
          rowSpan: 1,
          colSpan: 1,
          notes: undefined,
        };
      }
      const isCovered = coveredCoords.some((coord) => s.side === side && s.gridRow === coord.r && s.gridCol === coord.c);
      if (isCovered && s.slotNumber !== mainSlotNumber) {
        return {
          ...s,
          format: 'LARGE',
          rowSpan: 1,
          colSpan: 1,
          status: 'VACANT',
          priceUsd: 0,
          businessName: undefined,
          contactPerson: undefined,
          phone: undefined,
          email: undefined,
          website: undefined,
          logoUrl: undefined,
          offerHeadline: undefined,
          amountCollectedUsd: undefined,
          paidAt: undefined,
          paymentRef: undefined,
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
/**
 * The category for a cell coming back from under a merge: its own original one, unless that
 * category is already on the face (merges move categories around), in which case the first of
 * the face's original categories that is missing. Keeps a split from showing a niche twice.
 */
function restoredCategory(cell: SlotState, onFace: Set<number>) {
  const own = MODULAR_GRID_DEFS.find((d) => d.slotNumber === cell.slotNumber)?.categoryId;
  let id = own;
  if (id === undefined || onFace.has(id)) {
    id = MODULAR_GRID_DEFS.find((d) => d.side === cell.side && !d.isUspsZone && !onFace.has(d.categoryId))?.categoryId ?? own;
  }
  if (id !== undefined) onFace.add(id);
  return CLOSED_CATEGORIES.find((c) => c.id === id);
}

function categoriesOnFace(slots: SlotState[], side?: CardSide): Set<number> {
  return new Set(slots.filter((s) => s.side === side && !s.notes?.startsWith('Covered by')).map((s) => s.categoryId));
}

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
    const onFace = categoriesOnFace(normalized, side);

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
          priceUsd: 0,
          amountCollectedUsd: undefined,
          paidAt: undefined,
          paymentRef: undefined,
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
        const cat = restoredCategory(s, onFace);
        return {
          ...s,
          format: 'MEDIUM',
          rowSpan: 2,
          colSpan: 1,
          gridRow: originRow,
          gridCol: originCol + 1,
          status: 'VACANT',
          priceUsd: activeMedPrice,
          categoryId: cat?.id ?? s.categoryId,
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
          priceUsd: 0,
          amountCollectedUsd: undefined,
          paidAt: undefined,
          paymentRef: undefined,
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
  const onFace = categoriesOnFace(normalized, primary.side);
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
    // Exact owner match: a substring test let "#2" also free the cells of #20-#29.
    if (s.notes?.includes(`Covered by`) && Number(s.notes.match(/#(\d+)/)?.[1]) === primarySlotNum) {
      const def = MODULAR_GRID_DEFS.find((d) => d.slotNumber === s.slotNumber);
      const cat = restoredCategory(s, onFace);
      return {
        ...s,
        format: 'SMALL',
        rowSpan: 1,
        colSpan: 1,
        gridRow: def?.gridRow ?? s.gridRow,
        gridCol: def?.gridCol ?? s.gridCol,
        status: 'VACANT',
        priceUsd: activeSmallPrice,
        categoryId: cat?.id ?? s.categoryId,
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
    reservedAt: source.reservedAt,
    reservationExpiresAt: source.reservationExpiresAt,
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
          rowSpan: 1,
          colSpan: 1,
          status: 'VACANT',
          priceUsd: 0,
          amountCollectedUsd: undefined,
          paidAt: undefined,
          paymentRef: undefined,
          businessName: undefined,
          contactPerson: undefined,
          email: undefined,
          website: undefined,
          logoUrl: undefined,
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
          rowSpan: 1,
          colSpan: 1,
          status: 'VACANT',
          priceUsd: 0,
          amountCollectedUsd: undefined,
          paidAt: undefined,
          paymentRef: undefined,
          businessName: undefined,
          contactPerson: undefined,
          email: undefined,
          website: undefined,
          logoUrl: undefined,
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
          rowSpan: 1,
          colSpan: 1,
          status: 'VACANT',
          priceUsd: 0,
          amountCollectedUsd: undefined,
          paidAt: undefined,
          paymentRef: undefined,
          businessName: undefined,
          contactPerson: undefined,
          email: undefined,
          website: undefined,
          logoUrl: undefined,
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
  if (!slot.reservationExpiresAt) return 0;
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
 * Returns the operator's list price for a slot.
 * - If the slot is currently RESERVED, the stored priceUsd is the discounted price;
 *   we add the format discount back to recover the list price.
 * - If not reserved, priceUsd IS the list price (operator may have scaled it).
 * - Falls back to MODULAR_PRICES[format] only when priceUsd is absent.
 */
/**
 * A RESERVED slot stores its price as list − 72h discount, and so does a PAID one sold during
 * the reservation (it keeps reservedAt). Anything else stores the list price.
 */
function storesDiscountedPrice(slot: { status?: string; reservedAt?: string }): boolean {
  return slot.status === 'RESERVED' || (slot.status === 'PAID' && Boolean(slot.reservedAt));
}

export function getSlotListPrice(slot: {
  format?: SlotFormat;
  rowSpan?: number;
  colSpan?: number;
  slotNumber?: number;
  priceUsd?: number;
  status?: string;
  reservedAt?: string;
}): number {
  if (slot.slotNumber === 32 || slot.format === 'USPS') return 0;
  const fmt =
    slot.format ||
    (slot.rowSpan === 2 && slot.colSpan === 2
      ? 'LARGE'
      : slot.rowSpan === 2
      ? 'MEDIUM'
      : 'SMALL');
  const discount = RESERVATION_72H_DISCOUNTS[fmt] ?? 50;

  if (typeof slot.priceUsd === 'number' && slot.priceUsd > 0) {
    // The 72h offer is stored as list − discount → recover list
    if (storesDiscountedPrice(slot)) return slot.priceUsd + discount;
    // Otherwise priceUsd is already the list price
    return slot.priceUsd;
  }
  return MODULAR_PRICES[fmt] ?? 350;
}

/**
 * Returns the discounted price for 72-hour reservation.
 * - If already RESERVED, priceUsd is already the discounted price → return as-is.
 * - Otherwise, compute list price and subtract the format discount.
 */
export function getSlotDiscountedPrice(slot: {
  format?: SlotFormat;
  rowSpan?: number;
  colSpan?: number;
  slotNumber?: number;
  priceUsd?: number;
  status?: string;
  reservedAt?: string;
}): number {
  if (slot.slotNumber === 32 || slot.format === 'USPS') return 0;
  // Already holding the 72h offer: the stored price is the discounted one.
  if (storesDiscountedPrice(slot) && typeof slot.priceUsd === 'number' && slot.priceUsd > 0) {
    return slot.priceUsd;
  }
  const fmt =
    slot.format ||
    (slot.rowSpan === 2 && slot.colSpan === 2
      ? 'LARGE'
      : slot.rowSpan === 2
      ? 'MEDIUM'
      : 'SMALL');
  const discount = RESERVATION_72H_DISCOUNTS[fmt] ?? 50;
  const listPrice = getSlotListPrice(slot);
  return Math.max(0, listPrice - discount);
}

/**
 * Runs a merge, split or swap with every reservation at its list price, then takes the 72h
 * discount off again. A reserved slot stores list − discount, and the grid operations scale the
 * new format's price from the slot's current one, so feeding them the discounted price
 * compounds it (a $300 chico became a $555 mediano).
 */
export function withReservationsAtList(slots: SlotState[], op: (slots: SlotState[]) => SlotState[]): SlotState[] {
  const shift = (list: SlotState[], sign: 1 | -1) =>
    list.map((s) =>
      s.status === 'RESERVED' && !s.notes?.startsWith('Covered by') && s.priceUsd
        ? { ...s, priceUsd: Math.max(0, s.priceUsd + sign * (RESERVATION_72H_DISCOUNTS[s.format || 'SMALL'] ?? 50)) }
        : s,
    );
  return shift(op(shift(slots, 1)), -1);
}

/**
 * Returns comprehensive reservation pricing and discount info
 */
export function getSlotReservationInfo(slot: SlotState): {
  listPrice: number;
  discountUsd: number;
  discountedPrice: number;
  percentOff: number;
  isDiscounted: boolean;
} {
  const listPrice = getSlotListPrice(slot);
  const fmt =
    slot.format ||
    (slot.rowSpan === 2 && slot.colSpan === 2
      ? 'LARGE'
      : slot.rowSpan === 2
      ? 'MEDIUM'
      : 'SMALL');
  const discountUsd = RESERVATION_72H_DISCOUNTS[fmt] ?? 0;
  const discountedPrice = Math.max(0, listPrice - discountUsd);
  const percentOff = listPrice > 0 ? Math.round((discountUsd / listPrice) * 100) : 0;
  const isDiscounted = slot.status === 'RESERVED' && !isReservationExpired(slot);

  return {
    listPrice,
    discountUsd,
    discountedPrice,
    percentOff,
    isDiscounted,
  };
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

