import React from 'react';
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

  const paid = campaign.slots.filter(
    (s) => s.status === 'PAID' && s.format !== 'USPS' && s.slotNumber !== 32,
  ).length;
  const collected = collectedUsd(campaign);
  const contracted = contractedUsd(campaign);
  const cost = dropCostUsd(campaign);
  const margin = collected - cost;
  const costCovered = collected >= cost;
  const slotsMet = paid >= OPERATING_FLOOR;
  const floorMet = costCovered && slotsMet;

  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / TOTAL_SLOTS) * 100))}%`;

  return (
    <section className="mb-5 border border-rule bg-background">
      <dl className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
        <Entry label={t('common:finance.collected')} value={money(collected)} tone="ink" />
        <Entry label={t('common:finance.contracted')} value={money(contracted)} />
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
        <Entry
          label={t('common:finance.margin')}
          value={money(margin)}
          tone={margin > 0 ? 'clear' : 'due'}
        />
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
}> = ({ label, value, tone, note }) => (
  <div className="bg-background px-4 py-2.5">
    <dt className="field-label">{label}</dt>
    <dd
      className={`field-value mt-0.5 text-sm ${
        tone === 'clear' ? 'text-clear' : tone === 'due' ? 'text-due' : 'text-ink'
      }`}
    >
      {value}
    </dd>
    {note && <p className="mt-0.5 text-[0.63rem] leading-snug text-ink-faint">{note}</p>}
  </div>
);
