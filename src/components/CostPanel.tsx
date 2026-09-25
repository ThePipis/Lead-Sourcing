import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronUp, Printer, Sparkles, TrendingUp, DollarSign, ShieldCheck } from 'lucide-react';
import { AppMode } from '../hooks/useAppMode.ts';
import {
  CostSettings,
  CostSettingsDraft,
  DIRECT_MAIL_PARTNERS,
  DirectMailPartner,
  getCosts,
  updateCosts,
} from '../services/costService.ts';

interface CostPanelProps {
  mode: AppMode;
  /** Reach the figures are computed at — the typed one, not only the saved one. */
  households: number;
  /** Slots whose price can still be rewritten (not yet paid). */
  openSlots: number[];
  onApplySuggested: (prices: Record<number, number>) => void;
  /** Reported upward so the ledger and the gates move with the cost model. */
  onCostsChange: (unitCost: number, fixedCost: number) => void;
  isSaving: boolean;
}

const SETTLE_MS = 500;

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const CostPanel: React.FC<CostPanelProps> = ({
  mode,
  households,
  openSlots,
  onApplySuggested,
  onCostsChange,
  isSaving,
}) => {
  const { t } = useTranslation(['common']);
  const [costs, setCosts] = useState<CostSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('zoom_mailing');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Partial<CostSettingsDraft>>({});

  // Refetch on mode or reach change
  useEffect(() => {
    let alive = true;
    getCosts(mode, households)
      .then((next) => {
        if (!alive) return;
        setCosts(next);
        onCostsChange(next.unitCost, next.fixedCost);

        // Detect which partner matches closest
        const matched = DIRECT_MAIL_PARTNERS.find(
          (p) => Math.abs(p.costPerPiece - next.unitCost) < 0.005
        );
        if (matched) {
          setSelectedPartnerId(matched.id);
        } else {
          setSelectedPartnerId('custom');
        }
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, [mode, households]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const savePatch = (patch: Partial<CostSettingsDraft>) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setWriting(true);
      try {
        const next = await updateCosts(mode, households, patch);
        setCosts(next);
        onCostsChange(next.unitCost, next.fixedCost);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setWriting(false);
      }
    }, SETTLE_MS);
  };

  const handleSelectPartner = (partner: DirectMailPartner) => {
    setSelectedPartnerId(partner.id);
    const postage = 0.247;
    const print = Math.max(0, Number((partner.costPerPiece - postage).toFixed(4)));

    const patch: Partial<CostSettingsDraft> = {
      postagePerPiece: postage,
      printPerPiece: print,
      listPerPiece: 0,
      variableDataPerPiece: 0,
      presortPerPiece: 0,
      finishingPerPiece: 0,
      setupFee: 0,
      deliveryFee: 0,
      sourceNote: `${partner.name} (${partner.location}) · ${partner.note}`,
    };

    setCosts((prev) =>
      prev
        ? {
            ...prev,
            ...patch,
            unitCost: partner.costPerPiece,
            fixedCost: 0,
            previewTotalCost: partner.costPerPiece * households,
          }
        : prev
    );

    savePatch(patch);
  };

  const handleCustomUnitCost = (raw: string) => {
    const val = Number(raw);
    if (!Number.isFinite(val) || val <= 0) return;
    setSelectedPartnerId('custom');

    const postage = 0.247;
    const print = Math.max(0, Number((val - postage).toFixed(4)));

    const patch: Partial<CostSettingsDraft> = {
      postagePerPiece: postage,
      printPerPiece: print,
      sourceNote: `Cotización directa personalizada: $${val.toFixed(4)} por flyer todo incluido.`,
    };

    setCosts((prev) =>
      prev
        ? {
            ...prev,
            ...patch,
            unitCost: val,
            previewTotalCost: val * households + (prev.fixedCost || 0),
          }
        : prev
    );

    savePatch(patch);
  };

  const handleTargetMarginChange = (raw: string) => {
    const margin = Number(raw) / 100;
    if (!Number.isFinite(margin) || margin < 0 || margin > 0.95) return;

    setCosts((prev) => (prev ? { ...prev, targetMargin: margin } : prev));
    savePatch({ targetMargin: margin });
  };

  const currentUnitCost = costs?.unitCost ?? 0.615;
  const currentTotalCost = costs?.previewTotalCost ?? currentUnitCost * households;
  const targetMargin = costs?.targetMargin ?? 0.58;

  // Estimated gross revenue with the new modular flyer model (31 slots ~ $11,000 to $13,000 depending on sizes)
  // Or standard calculated required revenue
  const projectedRevenue = currentTotalCost / Math.max(0.05, 1 - targetMargin);
  const projectedProfit = Math.max(0, projectedRevenue - currentTotalCost);
  const currentPartner = DIRECT_MAIL_PARTNERS.find((p) => p.id === selectedPartnerId) || DIRECT_MAIL_PARTNERS[0];

  return (
    <section className="mb-5 border border-rule bg-background shadow-sm">
      {/* Header bar */}
      <button
        id="btn-costs-toggle"
        data-tour="costs"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/70"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-live/15 text-live">
            <Printer className="h-4 w-4" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-ink">
              Imprenta y Costos Direct Mail
            </span>
            <span className="ml-2 hidden text-xs text-ink-dim sm:inline">
              ({currentPartner.name} · ${currentUnitCost.toFixed(3)}/flyer)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="block text-xs font-bold text-live">
              {money(currentTotalCost)} <span className="font-normal text-ink-dim">total</span>
            </span>
            <span className="hidden text-[0.65rem] text-ink-faint sm:block">
              {households.toLocaleString('en-US')} hogares
            </span>
          </div>
          <span aria-hidden="true" className="text-sm font-bold text-ink-dim">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>
      </button>

      {/* Expanded Panel */}
      {open && (
        <div className="border-t border-rule p-4 space-y-5">
          {error && <p className="border border-due/40 bg-due/10 px-3 py-2 text-xs text-due">{error}</p>}

          <div className="rounded-md bg-secondary/40 p-3.5 border border-rule/60">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-live shrink-0 mt-0.5" />
              <div className="text-xs text-ink-dim leading-relaxed">
                <span className="font-semibold text-ink">Cotización All-Inclusive:</span> En lugar de desglosar
                preprensa, papel, fajado e inyección de tinta por separado, seleccionas tu socio de Direct Mail local
                del Inland Empire que te entrega la tarifa consolidada (impresión Jumbo 12"×9" + franqueo EDDM del
                USPS incluido).
              </div>
            </div>
          </div>

          {/* 1. Selector de Socio Direct Mail */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink block mb-2.5">
              1. Selecciona tu Socio de Direct Mail (Inland Empire)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {DIRECT_MAIL_PARTNERS.map((partner) => {
                const isSelected = selectedPartnerId === partner.id;
                return (
                  <button
                    key={partner.id}
                    type="button"
                    onClick={() => handleSelectPartner(partner)}
                    className={`text-left p-3 border transition-all relative ${
                      isSelected
                        ? 'border-live bg-live/10 shadow-sm ring-1 ring-live'
                        : 'border-rule bg-background hover:bg-secondary/60 hover:border-ink/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-ink">{partner.name}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-live" />}
                    </div>
                    <div className="text-[0.69rem] text-ink-dim mb-2">{partner.location}</div>
                    <div className="text-xs font-black text-live">
                      ${partner.costPerPiece.toFixed(3)}{' '}
                      <span className="text-[0.65rem] font-normal text-ink-dim">/ flyer</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Parámetros Clave: Costo por flyer y Margen */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-rule pt-4">
            <div>
              <label htmlFor="cost-per-piece-input" className="block text-xs font-semibold text-ink mb-1.5">
                Costo por Flyer Todo Incluido ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-ink-dim">$</span>
                <input
                  id="cost-per-piece-input"
                  type="number"
                  step="0.005"
                  min="0.10"
                  max="3.00"
                  value={Number(currentUnitCost.toFixed(4))}
                  onChange={(e) => handleCustomUnitCost(e.target.value)}
                  className="w-full pl-6 pr-3 py-2 border border-rule bg-background text-sm font-semibold text-ink focus:border-live focus:outline-none"
                />
              </div>
              <span className="text-[0.67rem] text-ink-dim mt-1 block">
                Papel 14pt + Full Color + Franqueo USPS EDDM Retail ($0.247)
              </span>
            </div>

            <div>
              <label htmlFor="target-margin-input" className="block text-xs font-semibold text-ink mb-1.5">
                Margen de Beneficio Objetivo (%)
              </label>
              <div className="relative">
                <input
                  id="target-margin-input"
                  type="number"
                  step="1"
                  min="10"
                  max="90"
                  value={Math.round(targetMargin * 100)}
                  onChange={(e) => handleTargetMarginChange(e.target.value)}
                  className="w-full px-3 py-2 border border-rule bg-background text-sm font-semibold text-ink focus:border-live focus:outline-none"
                />
                <span className="absolute right-3 top-2.5 text-xs text-ink-dim">%</span>
              </div>
              <span className="text-[0.67rem] text-ink-dim mt-1 block">
                Porcentaje de ganancia bruta sobre los ingresos totales recaudados
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Hogares de la Tirada
              </label>
              <div className="px-3 py-2 border border-rule/50 bg-secondary/50 text-sm font-bold text-ink">
                {households.toLocaleString('en-US')} hogares
              </div>
              <span className="text-[0.67rem] text-ink-dim mt-1 block">
                Volumen validado según las Carrier Routes de la microzona
              </span>
            </div>
          </div>

          {/* 3. Tarjetas Financieras Directas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2">
            <div className="border border-rule bg-secondary/20 p-3">
              <span className="text-[0.68rem] uppercase font-bold text-ink-dim block mb-1">
                Costo Total Tirada
              </span>
              <span className="text-base font-black text-due">
                {money(currentTotalCost)}
              </span>
              <span className="text-[0.63rem] text-ink-dim block mt-0.5">
                Pago a imprenta y correo
              </span>
            </div>

            <div className="border border-rule bg-secondary/20 p-3">
              <span className="text-[0.68rem] uppercase font-bold text-ink-dim block mb-1">
                Ingresos Estimados
              </span>
              <span className="text-base font-black text-ink">
                {money(projectedRevenue)}
              </span>
              <span className="text-[0.63rem] text-ink-dim block mt-0.5">
                Al vender todos los slots
              </span>
            </div>

            <div className="border border-live/40 bg-live/10 p-3">
              <span className="text-[0.68rem] uppercase font-bold text-live block mb-1">
                Ganancia Neta en Mano
              </span>
              <span className="text-base font-black text-live">
                {money(projectedProfit)}
              </span>
              <span className="text-[0.63rem] text-live/80 block mt-0.5">
                Beneficio libre de costos
              </span>
            </div>

            <div className="border border-rule bg-secondary/20 p-3">
              <span className="text-[0.68rem] uppercase font-bold text-ink-dim block mb-1">
                Margen Operativo
              </span>
              <span className="text-base font-black text-clear">
                {Math.round(targetMargin * 100)}%
              </span>
              <span className="text-[0.63rem] text-ink-dim block mt-0.5">
                Retorno sobre facturación
              </span>
            </div>
          </div>

          {/* Acciones y estado */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-rule">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-xs text-ink-dim hover:text-ink underline flex items-center gap-1"
              >
                {showAdvanced ? 'Ocultar desglose técnico' : 'Ver desglose técnico detallado'}
              </button>
              {writing && (
                <span className="text-xs text-live flex items-center gap-1 animate-pulse">
                  <Sparkles className="h-3 w-3" /> Guardando costos...
                </span>
              )}
            </div>

            {openSlots.length > 0 && costs?.suggestedPrices && (
              <button
                type="button"
                id="btn-apply-suggested"
                disabled={isSaving || writing}
                onClick={() => onApplySuggested(costs.suggestedPrices)}
                className="px-3.5 py-1.5 border border-live bg-live text-primary-foreground text-xs font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Aplicar Precios a {openSlots.length} Espacios Vacantes
              </button>
            )}
          </div>

          {/* Desglose técnico opcional */}
          {showAdvanced && (
            <div className="border border-rule bg-secondary/20 p-3 text-xs space-y-2 mt-2">
              <p className="font-bold text-ink mb-1">Desglose Postal y de Producción Registrado:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-ink-dim">
                <div>Franqueo USPS EDDM: ${costs?.postagePerPiece.toFixed(3) ?? '0.247'}</div>
                <div>Impresión Offset Jumbo: ${costs?.printPerPiece.toFixed(3) ?? '0.368'}</div>
                <div>Higiene CASS/NCOA: ${costs?.listPerPiece.toFixed(3) ?? '0.000'}</div>
                <div>Cargos de Setup: ${costs?.setupFee ?? '0.00'}</div>
                <div>Entrega BMEU: ${costs?.deliveryFee ?? '0.00'}</div>
                <div>Nota: {costs?.sourceNote || currentPartner.note}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
