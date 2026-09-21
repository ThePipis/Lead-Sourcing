import { AppMode } from '../hooks/useAppMode.ts';

const API_BASE = '/api';

/** The six mail-house lines plus data, fees and the margin we work to. */
export interface CostSettings {
  mode: AppMode;
  postagePerPiece: number;
  listPerPiece: number;
  printPerPiece: number;
  variableDataPerPiece: number;
  presortPerPiece: number;
  finishingPerPiece: number;
  setupFee: number;
  deliveryFee: number;
  targetMargin: number;
  sourceNote: string;
  /** Derived server-side so one formula governs both ends. */
  unitCost: number;
  fixedCost: number;
  previewHouseholds: number;
  previewTotalCost: number;
  /** Slot number → what that box has to sell for to hit the target margin. */
  suggestedPrices: Record<number, number>;
}

/** Editable fields only; the rest come back derived. */
export type CostSettingsDraft = Omit<
  CostSettings,
  'mode' | 'unitCost' | 'fixedCost' | 'previewHouseholds' | 'previewTotalCost' | 'suggestedPrices'
>;

const FIELD_MAP: Record<keyof CostSettingsDraft, string> = {
  postagePerPiece: 'postage_per_piece',
  listPerPiece: 'list_per_piece',
  printPerPiece: 'print_per_piece',
  variableDataPerPiece: 'variable_data_per_piece',
  presortPerPiece: 'presort_per_piece',
  finishingPerPiece: 'finishing_per_piece',
  setupFee: 'setup_fee',
  deliveryFee: 'delivery_fee',
  targetMargin: 'target_margin',
  sourceNote: 'source_note',
};

function fromBackend(raw: any): CostSettings {
  const prices: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw.suggested_prices ?? {})) {
    prices[Number(k)] = Number(v);
  }
  return {
    mode: raw.mode,
    postagePerPiece: raw.postage_per_piece ?? 0,
    listPerPiece: raw.list_per_piece ?? 0,
    printPerPiece: raw.print_per_piece ?? 0,
    variableDataPerPiece: raw.variable_data_per_piece ?? 0,
    presortPerPiece: raw.presort_per_piece ?? 0,
    finishingPerPiece: raw.finishing_per_piece ?? 0,
    setupFee: raw.setup_fee ?? 0,
    deliveryFee: raw.delivery_fee ?? 0,
    targetMargin: raw.target_margin ?? 0,
    sourceNote: raw.source_note ?? '',
    unitCost: raw.unit_cost ?? 0,
    fixedCost: raw.fixed_cost ?? 0,
    previewHouseholds: raw.preview_households ?? 0,
    previewTotalCost: raw.preview_total_cost ?? 0,
    suggestedPrices: prices,
  };
}

export async function getCosts(mode: AppMode, households: number): Promise<CostSettings> {
  const res = await fetch(`${API_BASE}/costs/${mode}?households=${households}`);
  if (!res.ok) throw new Error(`GET /costs/${mode} -> ${res.status}`);
  return fromBackend(await res.json());
}

export async function updateCosts(
  mode: AppMode,
  households: number,
  patch: Partial<CostSettingsDraft>,
): Promise<CostSettings> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    body[FIELD_MAP[key as keyof CostSettingsDraft]] = value;
  }
  const res = await fetch(`${API_BASE}/costs/${mode}?households=${households}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT /costs/${mode} -> ${res.status}`);
  return fromBackend(await res.json());
}
