import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, Lock } from 'lucide-react';
import { Campaign } from '../types.ts';
import {
  OPERATING_FLOOR,
  TOTAL_SLOTS,
  billableHouseholds,
  collectedUsd,
  contractedUsd,
  dropCostUsd,
} from '../workflow.ts';
import {
  computeCurrentGrossRevenue,
  computeMarginPercent,
  computeScaledPricesForMargin,
} from '../utils/modularGrid.ts';
import { getReachFloor } from '../services/routeService.ts';

export interface FinancialMetricsProps {
  campaign: Campaign;
  baseCampaign?: Campaign;
  onResize?: (households: number) => void;
  onDraftChange?: (households: number | null) => void;
  onApplySuggested?: (prices: Record<number, number>) => void;
  onTargetMarginSave?: (marginPercent: number) => void;
  isSaving?: boolean;
}

const MIN_FALLBACK = 508;
const MAX_REACH = 50000;
const SETTLE_MS = 650;

const money = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

/**
 * Centro Unificado de Control de Tirada y Libro Financiero (Ledger).
 *
 * Integra en una sola superficie armónica:
 * 1. Configuración operativa del alcance postal (hogares mínimos y rutas) y estrategia de margen.
 * 2. Tarifas proporcionales sincronizadas en vivo según formato de espacio.
 * 3. Libro de mandos con las 4 métricas financieras esenciales (Cobrado, Capacidad, Costo Operativo y Ganancia Neta).
 * 4. Barra de umbral operativo hacia el punto de equilibrio (12 espacios).
 */
export const FinancialMetrics: React.FC<FinancialMetricsProps> = ({
  campaign,
  baseCampaign,
  onResize,
  onDraftChange,
  onApplySuggested,
  onTargetMarginSave,
  isSaving,
}) => {
  const { t } = useTranslation(['common']);
  const partnersInputRef = useRef<HTMLInputElement>(null);

  // ------------------------------------------------------------- 1. Alcance Postal
  const targetZip = campaign.targetZip;
  const currentReach = baseCampaign?.totalTargetHouseholds ?? campaign.totalTargetHouseholds;
  const [draftReach, setDraftReach] = useState<string>(String(currentReach));
  const reachTimer = useRef<number | undefined>(undefined);
  const [floor, setFloor] = useState<number | null>(null);
  const [floorFailed, setFloorFailed] = useState(false);
  const [floorLoading, setFloorLoading] = useState(true);
  const [showReachInfo, setShowReachInfo] = useState(false);

  useEffect(() => {
    let alive = true;
    setFloorFailed(false);
    setFloorLoading(true);
    getReachFloor(targetZip)
      .then((f) => alive && setFloor(f.smallestRoute))
      .catch(() => alive && setFloorFailed(true))
      .finally(() => alive && setFloorLoading(false));
    return () => {
      alive = false;
    };
  }, [targetZip]);

  const minReach = floor ?? MIN_FALLBACK;

  useEffect(() => {
    setDraftReach(String(currentReach));
  }, [currentReach, campaign.id]);

  useEffect(() => () => window.clearTimeout(reachTimer.current), []);

  const paid = campaign.slots.filter(
    (s) => s.status === 'PAID' && s.format !== 'USPS' && s.slotNumber !== 32,
  ).length;
  const inProduction = campaign.status === 'IN_PRODUCTION' || campaign.status === 'MAILED';
  const locked = paid > 0 || inProduction;

  const nextReach = Number(draftReach);
  const validReach = Number.isFinite(nextReach) && nextReach >= minReach && nextReach <= MAX_REACH;
  const pendingReach = validReach && nextReach !== currentReach;

  const handleReachChange = (raw: string) => {
    setDraftReach(raw);
    window.clearTimeout(reachTimer.current);

    const parsed = Number(raw);
    const ok = Number.isFinite(parsed) && parsed >= minReach && parsed <= MAX_REACH;
    onDraftChange?.(ok ? parsed : null);
    if (!ok || parsed === currentReach) return;

    reachTimer.current = window.setTimeout(() => onResize?.(parsed), SETTLE_MS);
  };

  const handleReachBlur = () => {
    window.clearTimeout(reachTimer.current);
    const parsed = Number(draftReach);
    let clamped: number;

    if (!Number.isFinite(parsed) || parsed < minReach) {
      clamped = minReach;
    } else if (parsed > MAX_REACH) {
      clamped = MAX_REACH;
    } else {
      clamped = Math.round(parsed);
    }

    setDraftReach(String(clamped));
    onDraftChange?.(null);
    if (clamped !== currentReach) {
      onResize?.(clamped);
    }
  };

  // ------------------------------------------------------------- 2. Socios y Ganancia
  const [partnersCount, setPartnersCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('coop_partners_count');
      const parsed = saved ? parseInt(saved, 10) : 2;
      return !isNaN(parsed) && parsed >= 1 ? parsed : 2;
    } catch {
      return 2;
    }
  });

  const handlePartnersChange = (val: number) => {
    const valid = Math.max(1, Math.min(50, val));
    setPartnersCount(valid);
    try {
      localStorage.setItem('coop_partners_count', String(valid));
    } catch {}
  };

  useEffect(() => {
    const el = partnersInputRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      setPartnersCount((prev) => {
        const next = Math.max(1, Math.min(50, prev + delta));
        try {
          localStorage.setItem('coop_partners_count', String(next));
        } catch {}
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const collected = collectedUsd(campaign);
  const contracted = contractedUsd(campaign);
  const cost = dropCostUsd(campaign);
  const netProfit = contracted - cost;
  const costCovered = collected >= cost;
  const slotsMet = paid >= OPERATING_FLOOR;
  const floorMet = costCovered && slotsMet;

  const validPartners = Math.max(1, partnersCount);
  const profitPerPartner = Math.round(netProfit / validPartners);

  // ------------------------------------------------------------- 3. Margen y Tarifas Proporcionales
  const currentTotalCost = cost;
  const currentGrossRevenue = React.useMemo(
    () => computeCurrentGrossRevenue(campaign.slots),
    [campaign.slots],
  );
  const actualCalculatedMargin = React.useMemo(
    () => computeMarginPercent(currentGrossRevenue, currentTotalCost),
    [currentGrossRevenue, currentTotalCost],
  );

  const [marginInput, setMarginInput] = useState<number>(actualCalculatedMargin);
  const [isTypingMargin, setIsTypingMargin] = useState(false);
  const syncTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isTypingMargin) {
      setMarginInput(actualCalculatedMargin);
    }
  }, [actualCalculatedMargin, isTypingMargin]);

  const scaledTariffs = React.useMemo(
    () => computeScaledPricesForMargin(campaign.slots, marginInput, currentTotalCost, 5),
    [campaign.slots, marginInput, currentTotalCost],
  );

  const handleTargetMarginChange = (raw: string) => {
    const val = Number(raw);
    setMarginInput(val);
    setIsTypingMargin(true);

    if (!Number.isFinite(val) || val < 5 || val > 95) return;

    const scaled = computeScaledPricesForMargin(campaign.slots, val, currentTotalCost, 5);
    onApplySuggested?.(scaled.pricesBySlot);

    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      onTargetMarginSave?.(val);
      setIsTypingMargin(false);
    }, 450);
  };

  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / TOTAL_SLOTS) * 100))}%`;

  // Nota de costo operativo enriquecida sin duplicaciones
  const unitPieceCost = campaign.unitCostUsd ?? 0.615;
  const householdsNum = billableHouseholds(campaign).toLocaleString('en-US');
  const routesNum = campaign.selectedRoutes ?? 0;
  const costNote = routesNum > 0
    ? `$${unitPieceCost.toFixed(3)}/ud · ${householdsNum} hogares (${routesNum} rutas)`
    : `$${unitPieceCost.toFixed(3)}/ud · ${householdsNum} hogares`;

  return (
    <section data-tour="reach" className="mb-5 border border-rule bg-background shadow-xs">
      {/* 1. Barra Superior: Configuración Operativa (Alcance, Margen y Tarifas) */}
      <div className="border-b border-rule bg-secondary/35 px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 select-none">
        
        {/* Lado Izquierdo: Alcance Postal */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <label
            htmlFor="campaign-reach"
            className="field-label text-[0.68rem] font-bold text-ink uppercase tracking-wider cursor-pointer"
          >
            {t('common:reach.label', 'Alcance de la tirada')}:
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="campaign-reach"
              type="number"
              inputMode="numeric"
              min={minReach}
              max={MAX_REACH}
              step={5}
              value={draftReach}
              disabled={locked}
              onChange={(e) => handleReachChange(e.target.value)}
              onBlur={handleReachBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleReachBlur();
                  e.currentTarget.blur();
                }
              }}
              aria-describedby="campaign-reach-note"
              aria-invalid={!validReach}
              className={`h-7 w-24 border bg-card px-2 text-center font-mono text-xs font-bold text-ink focus-visible:ring-1 focus-visible:ring-live focus:outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                validReach ? 'border-rule' : 'border-due'
              }`}
            />
            <span className="text-[0.68rem] font-mono text-ink-dim uppercase">
              {t('common:reach.unit', 'hogares')}
            </span>
          </div>

          {/* Estado / Ayuda / Bloqueo */}
          <div className="flex items-center gap-1.5 pl-0.5">
            {locked ? (
              <span className="inline-flex items-center gap-1 text-[0.65rem] text-due font-mono font-medium">
                <Lock className="h-3 w-3" />
                {inProduction ? t('common:reach.lockedProduction') : `Bloqueado (${paid} de ${TOTAL_SLOTS} espacios pagados)`}
              </span>
            ) : isSaving || pendingReach ? (
              <span className="text-[0.65rem] font-bold font-mono text-live animate-pulse">
                {t('common:form.saving', 'Guardando…')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-rule bg-background text-[0.62rem] font-mono text-ink-dim">
                Mín. {minReach.toLocaleString('en-US')} ({campaign.targetZip})
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowReachInfo((v) => !v)}
              aria-label="Ver explicación de rutas EDDM"
              title="Información sobre distribución postal por rutas carrier"
              className="p-1 text-ink-dim hover:text-ink transition-colors cursor-pointer"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Lado Derecho: Margen Objetivo y Tarifas Proporcionales */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Margen */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="target-margin-input"
              className="field-label text-[0.68rem] font-bold text-ink cursor-pointer uppercase tracking-wider"
            >
              {t('common:finance.targetMargin', 'Margen')}:
            </label>
            <div className="relative flex items-center">
              <input
                id="target-margin-input"
                type="number"
                step={1}
                min={5}
                max={95}
                value={marginInput}
                disabled={isSaving}
                onChange={(e) => handleTargetMarginChange(e.target.value)}
                className="h-7 w-14 border border-rule bg-card px-1.5 pr-4 text-center font-mono text-xs font-bold text-ink focus-visible:ring-1 focus-visible:ring-live focus:outline-none"
                title="Margen de beneficio objetivo porcentual sobre la recaudación bruta"
              />
              <span className="pointer-events-none absolute right-1.5 font-mono text-[0.62rem] text-ink-dim">
                %
              </span>
            </div>
            <span className="inline-flex items-center gap-1 font-mono text-[0.62rem] font-bold uppercase tracking-wider text-live">
              <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse" aria-hidden="true" />
              <span className="hidden sm:inline">{t('common:finance.targetMarginSub', 'En vivo')}</span>
            </span>
          </div>

          {/* Tarifas Proporcionales */}
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[0.68rem]">
            <span className="field-label text-[0.62rem] text-ink-dim hidden xl:inline uppercase tracking-wider mr-0.5">
              {t('common:finance.proportionalTariffs', 'Tarifas:')}
            </span>
            <span className="inline-flex items-center gap-1 border border-rule bg-card px-2 py-1 text-ink shadow-xs">
              <span className="h-2 w-2 rounded-xs bg-emerald-500" aria-hidden="true" />
              {t('common:finance.smallSize', 'Chico (1×1)')}: <strong className="font-bold text-live">${scaledTariffs.smallPrice}</strong>
            </span>
            <span className="inline-flex items-center gap-1 border border-rule bg-card px-2 py-1 text-ink shadow-xs">
              <span className="h-2 w-2 rounded-xs bg-blue-500" aria-hidden="true" />
              {t('common:finance.mediumSize', 'Mediano (1×2)')}: <strong className="font-bold text-live">${scaledTariffs.mediumPrice}</strong>
            </span>
            <span className="inline-flex items-center gap-1 border border-rule bg-card px-2 py-1 text-ink shadow-xs">
              <span className="h-2 w-2 rounded-xs bg-purple-500" aria-hidden="true" />
              {t('common:finance.largeSize', 'Grande (2×2)')}: <strong className="font-bold text-live">${scaledTariffs.largePrice}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Nota Explicativa Desplegable de Rutas Carrier EDDM */}
      {showReachInfo && (
        <div
          id="campaign-reach-note"
          className="border-b border-rule bg-secondary/15 px-4 py-2.5 text-xs leading-relaxed text-ink-dim flex items-start justify-between gap-3 animate-fadeIn"
        >
          <p>
            {floor
              ? t('common:reach.hintFloor', {
                  floor: floor.toLocaleString('en-US'),
                  zip: campaign.targetZip,
                })
              : t('common:reach.hint')}
          </p>
          <button
            type="button"
            onClick={() => setShowReachInfo(false)}
            aria-label="Cerrar nota informativa"
            className="text-xs text-ink-dim hover:text-ink font-bold px-1.5 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Cuadro de Mandos Financiero (4 Tarjetas KPI) */}
      <dl className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
        <Entry
          label={t('common:finance.collected')}
          value={money(collected)}
          tone="ink"
          sublabel={t('common:finance.collectedSub')}
        />
        <Entry
          label={t('common:finance.contracted')}
          value={money(contracted)}
          sublabel={t('common:finance.contractedSub')}
        />
        <Entry
          label={t('common:finance.cost')}
          value={money(cost)}
          tone={costCovered ? 'clear' : undefined}
          note={costNote}
        />
        <div className="bg-background px-4 py-2.5 flex flex-col justify-between">
          {/* Cabecera: Título + Stepper de Socios */}
          <div className="flex items-center justify-between gap-1.5">
            <dt className="field-label">{t('common:finance.margin')}</dt>
            <div className="flex items-center gap-1 bg-secondary/80 px-2 py-0.5 border border-rule">
              <label
                htmlFor="partners-count-input"
                className="field-label text-[0.62rem] text-ink-dim cursor-pointer select-none"
              >
                {t('common:finance.partners')}:
              </label>
              <input
                id="partners-count-input"
                ref={partnersInputRef}
                type="number"
                inputMode="numeric"
                spellCheck={false}
                min={1}
                max={50}
                step={1}
                value={partnersCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) handlePartnersChange(val);
                }}
                className="w-11 h-5 text-center font-mono text-xs font-bold border border-rule bg-background text-ink focus-visible:ring-1 focus-visible:ring-live focus:outline-none"
                title="Número de socios para repartir ganancia (scroll con rueda del ratón o flechas)"
              />
            </div>
          </div>

          {/* Cifras: Total libre y Monto por Socio */}
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <div>
              <dd
                className={`field-value text-xl sm:text-2xl font-black tracking-tight ${
                  netProfit > 0 ? 'text-clear' : 'text-due'
                }`}
              >
                {money(netProfit)}
              </dd>
            </div>
            <div className="text-right">
              <div className="field-value text-xl sm:text-2xl font-black text-clear inline-flex items-baseline gap-1">
                {money(profitPerPartner)}
                <span className="text-xs sm:text-sm font-bold text-ink-dim">c/u</span>
              </div>
            </div>
          </div>

          {/* Subetiquetas */}
          <div className="mt-0.5 flex items-center justify-between text-[0.65rem] leading-snug">
            <span className="text-ink-faint">
              {t('common:finance.netProfitTotalSub')}
            </span>
            <span className="field-label text-[0.62rem] font-bold text-clear">
              {t('common:finance.perPartnerSub', 'Cada socio')} ({partnersCount})
            </span>
          </div>
        </div>
      </dl>

      {/* 3. Escala y Piso Operativo */}
      <div className="px-4 py-3 border-t border-rule">
        <div className="flex items-baseline justify-between gap-3">
          <span className="field-label">
            {floorMet
              ? t('common:finance.floorMet')
              : !costCovered
                ? t('common:finance.floorMissingCost', {
                    missing: Math.ceil(cost - collected).toLocaleString('en-US'),
                    households: billableHouseholds(campaign).toLocaleString('en-US'),
                  })
                : t('common:finance.floorMissing', {
                    missing: OPERATING_FLOOR - paid,
                    floor: OPERATING_FLOOR,
                  })}
          </span>
          <span className="field-value text-xs text-ink-dim font-mono">
            {paid}/{TOTAL_SLOTS}
          </span>
        </div>

        {/* Barra de progreso visual hacia el piso operativo */}
        <div className="relative mt-2 h-3 border border-rule bg-card">
          <div
            className={`h-full transition-[width] duration-500 ease-out ${
              floorMet ? 'bg-clear' : 'bg-live'
            }`}
            style={{ width: pct(paid) }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-y-[-4px] w-px bg-ink-dim"
            style={{ left: pct(OPERATING_FLOOR) }}
          />
          <span
            aria-hidden="true"
            className="field-label absolute top-4 -translate-x-1/2 text-[0.56rem] text-ink-faint"
            style={{ left: pct(OPERATING_FLOOR) }}
          >
            {OPERATING_FLOOR}
          </span>
        </div>
      </div>
    </section>
  );
};

const Entry: React.FC<{
  label: string;
  value: string;
  tone?: 'ink' | 'clear' | 'due';
  /** Procedencia o contexto de la cifra */
  note?: string;
  sublabel?: string;
}> = ({ label, value, tone, note, sublabel }) => (
  <div className="bg-background px-4 py-2.5 flex flex-col justify-between">
    <dt className="field-label">{label}</dt>
    <dd
      className={`field-value mt-1 text-xl sm:text-2xl font-bold tracking-tight ${
        tone === 'clear' ? 'text-clear' : tone === 'due' ? 'text-due' : 'text-ink'
      }`}
    >
      {value}
    </dd>
    {note || sublabel ? (
      <p className="mt-0.5 text-[0.65rem] leading-snug text-ink-faint truncate">
        {note || sublabel}
      </p>
    ) : (
      <div className="h-[15px]" aria-hidden="true" />
    )}
  </div>
);
