import React from 'react';
import { useTranslation } from 'react-i18next';
import { Campaign } from '../types.ts';

interface ProductionSectionProps {
  campaign: Campaign;
  onMarkMailed: () => void;
  isSaving: boolean;
}

/** Day-first and spelled month, the way a datestamp reads, in the UI's language. */
const stampDate = (iso: string | undefined, locale: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d
    .toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase();
};

/**
 * Section 5. The drop is printed; this records that it went into the mail and
 * then reports what each business got back. Those per-business scan counts are
 * the evidence the partner uses to sell the next cycle, which is why they are
 * a phase of the campaign rather than a report filed somewhere else.
 */
export const ProductionSection: React.FC<ProductionSectionProps> = ({
  campaign,
  onMarkMailed,
  isSaving,
}) => {
  const { t, i18n } = useTranslation(['common']);
  const mailed = campaign.status === 'MAILED';

  const ranked = [...campaign.slots]
    .filter((s) => s.status !== 'VACANT')
    .sort((a, b) => b.scanCount - a.scanCount);
  const totalScans = ranked.reduce((acc, s) => acc + s.scanCount, 0);
  const best = ranked[0];

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-3">
        <Box label={t('common:production.printedOn')} value={stampDate(campaign.productionAt, i18n.language)} />
        <Box
          label={t('common:production.mailedOn')}
          value={stampDate(campaign.mailedAt, i18n.language)}
          tone={mailed ? 'clear' : undefined}
        />
        <Box
          label={t('common:production.households')}
          value={(campaign.curatedCount ?? 0).toLocaleString('en-US')}
        />
      </dl>

      {!mailed ? (
        <div className="border border-live/50 bg-background p-5">
          <p className="field-label text-live">{t('common:production.awaitingLabel')}</p>
          <p className="mt-2 max-w-[68ch] text-xs leading-relaxed text-ink-dim">
            {t('common:production.awaitingBody')}
          </p>
          <button
            id="btn-mark-mailed"
            type="button"
            onClick={onMarkMailed}
            disabled={isSaving}
            className="imperative mt-4 border border-live bg-live px-4 py-2.5 text-[0.69rem] text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSaving ? t('common:form.saving') : t('common:production.markMailed')}
          </button>
        </div>
      ) : (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-strong pb-2">
            <h3 className="imperative text-xs text-ink">{t('common:production.resultsTitle')}</h3>
            <span className="font-mono text-[0.69rem] tabular-nums text-ink-dim">
              {t('common:production.totalScans', { count: totalScans })}
            </span>
          </div>

          {totalScans === 0 ? (
            <p className="py-8 text-xs text-ink-dim">{t('common:production.noScans')}</p>
          ) : (
            <>
              {best && best.scanCount > 0 && (
                <p className="mt-3 max-w-[68ch] text-xs leading-relaxed text-ink-dim">
                  {t('common:production.renewalNote', {
                    business: best.businessName || `Slot ${best.slotNumber}`,
                    count: best.scanCount,
                  })}
                </p>
              )}
              <table className="mt-4 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule">
                    <th className="field-label py-2 pr-3">{t('common:production.colSlot')}</th>
                    <th className="field-label py-2 pr-3">{t('common:production.colBusiness')}</th>
                    <th className="field-label py-2 pl-3 text-right">
                      {t('common:production.colScans')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((s) => {
                    const share = totalScans > 0 ? (s.scanCount / totalScans) * 100 : 0;
                    return (
                      <tr key={s.slotNumber} className="border-b border-rule">
                        <td className="field-value py-2 pr-3 text-xs text-ink-dim">
                          {String(s.slotNumber).padStart(2, '0')}
                        </td>
                        <td className="py-2 pr-3 text-xs text-ink">
                          {s.businessName || t('common:production.unnamed')}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          <span
                            className={`field-value text-xs ${
                              s.scanCount > 0 ? 'text-clear' : 'text-ink-faint'
                            }`}
                          >
                            {s.scanCount}
                          </span>
                          <span
                            aria-hidden="true"
                            className="ml-2 inline-block h-1.5 align-middle bg-clear"
                            style={{
                              width: `${Math.max(share * 0.6, s.scanCount > 0 ? 3 : 0)}px`,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}
    </div>
  );
};

const Box: React.FC<{ label: string; value: string; tone?: 'clear' }> = ({
  label,
  value,
  tone,
}) => (
  <div className="bg-card px-4 py-3">
    <dt className="field-label">{label}</dt>
    <dd className={`field-value mt-1 text-sm ${tone === 'clear' ? 'text-clear' : 'text-ink'}`}>
      {value}
    </dd>
  </div>
);
