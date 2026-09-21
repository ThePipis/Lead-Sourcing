import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppMode } from '../hooks/useAppMode.ts';
import { CostSettings, CostSettingsDraft, getCosts, updateCosts } from '../services/costService.ts';

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

const SETTLE_MS = 650;

/** The six mail-house lines, in the order the job runs through the plant. */
const PER_PIECE: { key: keyof CostSettingsDraft; step: number }[] = [
  { key: 'listPerPiece', step: 0.005 },
  { key: 'printPerPiece', step: 0.01 },
  { key: 'variableDataPerPiece', step: 0.005 },
  { key: 'presortPerPiece', step: 0.005 },
  { key: 'finishingPerPiece', step: 0.005 },
  { key: 'postagePerPiece', step: 0.005 },
];

const FIXED: { key: keyof CostSettingsDraft; step: number }[] = [
  { key: 'setupFee', step: 25 },
  { key: 'deliveryFee', step: 25 },
];

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * What the drop costs us, line by line, and what each box therefore has to
 * sell for.
 *
 * The operator negotiates these numbers with the mail house and the data
 * vendor; nobody publishes them. So this is an input surface, not a read-out:
 * type the quote, and the suggested prices for all fourteen boxes move with it.
 * Figures are computed on the server so one formula governs both ends.
 */
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
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Partial<CostSettingsDraft>>({});

  // Refetch on mode or reach change: both move every figure in here.
  useEffect(() => {
    let alive = true;
    getCosts(mode, households)
      .then((next) => {
        if (!alive) return;
        setCosts(next);
        onCostsChange(next.unitCost, next.fixedCost);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, [mode, households]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const edit = (key: keyof CostSettingsDraft, raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    setCosts((prev) => (prev ? { ...prev, [key]: value } : prev));
    pending.current[key] = value;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const patch = pending.current;
      pending.current = {};
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

  const suggested: Record<number, number> = costs?.suggestedPrices ?? {};
  const cardTotal = Object.values(suggested).reduce((a, b) => a + b, 0);
  const quoted = costs ? costs.unitCost > (costs.postagePerPiece || 0) : false;

  return (
    <section className="mb-5 border border-rule bg-background">
      <button
        id="btn-costs-toggle"
        data-tour="costs"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary"
      >
        <span className="field-label">{t('common:costs.title')}</span>
        <span className="flex items-center gap-4">
          {costs && (
            <span className="field-value text-xs text-ink-dim">
              ${costs.unitCost.toFixed(4)} / {t('common:costs.piece')} ·{' '}
              {money(costs.previewTotalCost)}
            </span>
          )}
          <span aria-hidden="true" className="field-label text-ink-faint">
            {open ? '−' : '+'}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-rule">
          {error && <p className="border-b border-due/40 px-4 py-2 text-xs text-due">{error}</p>}

          <p className="px-4 pt-3 text-xs leading-relaxed text-ink-dim">
            {t('common:costs.intro', { households: households.toLocaleString('en-US') })}
          </p>

          {/* Entry point. The two published EDDM rates differ by a third of a
              cent per piece, which over a full drop is real money, so they are
              one click apart rather than a number to remember and retype. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule px-4 pt-3">
            <span className="field-label">{t('common:costs.entry')}</span>
            {(
              [
                { id: 'retail', rate: 0.247 },
                { id: 'bmeu', rate: 0.213 },
              ] as const
            ).map((option) => {
              const active =
                costs !== null && Math.abs(costs.postagePerPiece - option.rate) < 0.0005;
              return (
                <button
                  key={option.id}
                  id={`btn-postage-${option.id}`}
                  type="button"
                  disabled={!costs}
                  onClick={() => edit('postagePerPiece', String(option.rate))}
                  className={`field-label min-h-11 border px-3 transition-colors disabled:opacity-40 ${
                    active
                      ? 'border-live bg-live/15 text-live'
                      : 'border-rule text-ink-dim hover:bg-secondary hover:text-ink'
                  }`}
                >
                  {t(`common:costs.${option.id}`)} · ${option.rate.toFixed(3)}
                </button>
              );
            })}
          </div>

          {/* Mail-house service lines, priced per piece. */}
          <dl className="mt-3 divide-y divide-rule border-t border-rule">
            {PER_PIECE.map(({ key, step }) => (
              <Row
                key={key}
                id={`cost-${key}`}
                label={t(`common:costs.lines.${key}.label`)}
                note={t(`common:costs.lines.${key}.note`)}
                value={costs ? (costs[key] as number) : 0}
                step={step}
                decimals={4}
                disabled={!costs}
                onChange={(raw) => edit(key, raw)}
                suffix={t('common:costs.perPiece')}
              />
            ))}
            {FIXED.map(({ key, step }) => (
              <Row
                key={key}
                id={`cost-${key}`}
                label={t(`common:costs.lines.${key}.label`)}
                note={t(`common:costs.lines.${key}.note`)}
                value={costs ? (costs[key] as number) : 0}
                step={step}
                decimals={2}
                disabled={!costs}
                onChange={(raw) => edit(key, raw)}
                suffix={t('common:costs.perDrop')}
              />
            ))}
            <Row
              id="cost-targetMargin"
              label={t('common:costs.lines.targetMargin.label')}
              note={t('common:costs.lines.targetMargin.note')}
              value={costs ? Math.round(costs.targetMargin * 100) : 0}
              step={1}
              decimals={0}
              max={95}
              disabled={!costs}
              onChange={(raw) => edit('targetMargin', String(Number(raw) / 100))}
              suffix="%"
            />
          </dl>

          {/* What the lines add up to, and what we therefore charge. */}
          {costs && (
            <div className="border-t border-rule bg-card">
              <dl className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
                <Figure
                  label={t('common:costs.unitCost')}
                  value={`$${costs.unitCost.toFixed(4)}`}
                />
                <Figure label={t('common:costs.fixedCost')} value={money(costs.fixedCost)} />
                <Figure
                  label={t('common:costs.totalCost')}
                  value={money(costs.previewTotalCost)}
                  tone="due"
                />
                <Figure label={t('common:costs.cardValue')} value={money(cardTotal)} tone="clear" />
              </dl>

              <div className="px-4 py-3">
                <p className="field-label">{t('common:costs.suggested')}</p>
                <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
                  <Figure
                    bare
                    label={t('common:costs.hero')}
                    value={money(suggested[1] ?? 0)}
                    tone="ink"
                  />
                  <Figure
                    bare
                    label={t('common:costs.standard')}
                    value={money(suggested[2] ?? 0)}
                    tone="ink"
                  />
                  <Figure
                    bare
                    label={t('common:costs.back')}
                    value={money(suggested[14] ?? 0)}
                    tone="ink"
                  />
                </dl>

                <p className="mt-3 text-xs leading-relaxed text-ink-dim">
                  {quoted
                    ? t('common:costs.ready', { margin: Math.round(costs.targetMargin * 100) })
                    : t('common:costs.unquoted')}
                </p>

                <button
                  id="btn-apply-suggested"
                  type="button"
                  disabled={openSlots.length === 0 || isSaving || cardTotal === 0}
                  onClick={() => onApplySuggested(suggested)}
                  className="mt-3 min-h-11 border border-ink px-4 text-ink transition-colors hover:bg-ink hover:text-background disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="imperative text-[0.69rem]">
                    {t('common:costs.applyToSlots', { count: openSlots.length })}
                  </span>
                </button>

                {(writing || isSaving) && (
                  <span className="field-label ml-3 text-live">{t('common:form.saving')}</span>
                )}

                {costs.sourceNote && (
                  <p className="mt-3 border-t border-rule pt-2.5 text-xs leading-relaxed text-ink-faint">
                    {costs.sourceNote}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const Row: React.FC<{
  id: string;
  label: string;
  note: string;
  value: number;
  step: number;
  decimals: number;
  max?: number;
  disabled: boolean;
  suffix: string;
  onChange: (raw: string) => void;
}> = ({ id, label, note, value, step, decimals, max, disabled, suffix, onChange }) => (
  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-4 py-3">
    <div className="min-w-0 flex-1">
      <dt>
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      </dt>
      <dd className="mt-1 text-xs leading-relaxed text-ink-dim">{note}</dd>
    </div>
    <dd className="flex shrink-0 items-center gap-2">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        step={step}
        disabled={disabled}
        value={Number(value.toFixed(decimals))}
        onChange={(e) => onChange(e.target.value)}
        className="field-value w-28 border border-rule bg-background px-3 py-2 text-sm disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="field-label w-16 text-ink-faint">{suffix}</span>
    </dd>
  </div>
);

const Figure: React.FC<{
  label: string;
  value: string;
  tone?: 'ink' | 'clear' | 'due';
  bare?: boolean;
}> = ({ label, value, tone, bare }) => (
  <div className={bare ? '' : 'bg-background px-4 py-2.5'}>
    <dt className="field-label">{label}</dt>
    <dd
      className={`field-value mt-0.5 text-sm ${
        tone === 'clear' ? 'text-clear' : tone === 'due' ? 'text-due' : 'text-ink'
      }`}
    >
      {value}
    </dd>
  </div>
);
