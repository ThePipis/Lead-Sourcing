import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Campaign } from '../types.ts';
import {
  OPERATING_FLOOR,
  TOTAL_SLOTS,
  billableHouseholds,
  collectedUsd,
  contractedUsd,
  dropCostUsd,
} from '../workflow.ts';

interface FinancialMetricsProps {
  campaign: Campaign;
}

const money = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

/**
 * Section 1's ledger. All revenue enters here, so this is the only place the
 * money is shown: a strip above the card, not a dashboard smeared across every
 * screen. The floor is drawn as a notch on the scale because 12 paid slots is
 * a physical threshold, not a number to remember.
 */
export const FinancialMetrics: React.FC<FinancialMetricsProps> = ({ campaign }) => {
  const { t } = useTranslation(['common']);
  const partnersInputRef = useRef<HTMLInputElement>(null);

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

  const paid = campaign.slots.filter(
    (s) => s.status === 'PAID' && s.format !== 'USPS' && s.slotNumber !== 32,
  ).length;
  const collected = collectedUsd(campaign);
  const contracted = contractedUsd(campaign);
  const cost = dropCostUsd(campaign);
  const netProfit = contracted - cost;
  const costCovered = collected >= cost;
  const slotsMet = paid >= OPERATING_FLOOR;
  const floorMet = costCovered && slotsMet;

  const validPartners = Math.max(1, partnersCount);
  const profitPerPartner = Math.round(netProfit / validPartners);

  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / TOTAL_SLOTS) * 100))}%`;

  return (
    <section className="mb-5 border border-rule bg-background">
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
          note={
            (campaign.selectedRoutes ?? 0) > 0
              ? t('common:finance.fromRoutes', {
                  households: billableHouseholds(campaign).toLocaleString('en-US'),
                  routes: campaign.selectedRoutes,
                })
              : undefined
          }
        />
        <div className="bg-background px-4 py-2.5 flex flex-col justify-between">
          {/* Header line: Title + Partner Stepper */}
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

          {/* Numbers line: Total & Payout per Partner */}
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

          {/* Sublabels line */}
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

      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          {/* Two conditions gate the campaign; name the one still missing. */}
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
          <span className="field-value text-xs text-ink-dim">
            {paid}/{TOTAL_SLOTS}
          </span>
        </div>

        {/* Scale of fourteen, with the operating floor cut into it. */}
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
  /** Where the figure comes from, when that is not obvious. */
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
