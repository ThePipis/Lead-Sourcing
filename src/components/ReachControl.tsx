import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Campaign } from '../types.ts';
import { dropCostUsd } from '../workflow.ts';
import { getReachFloor } from '../services/routeService.ts';

interface ReachControlProps {
  campaign: Campaign;
  /** Called once typing settles; the caller commits it to the backend. */
  onResize: (households: number) => void;
  /** Reported upward on every keystroke so the whole section previews live. */
  onDraftChange: (households: number | null) => void;
  isSaving: boolean;
}

/**
 * The floor until the ZIP's own is known.
 *
 * The real one is not a policy, it is geography: a carrier walks whole routes,
 * so the smallest drop a ZIP can take is its smallest route — 508 households in
 * Eastvale, for example. Asking for fewer does not make a smaller drop, it
 * makes the same drop with a smaller number written beside it. The control
 * fetches the real figure and uses it; this stands in until it arrives.
 */
const MIN = 508;
const MAX = 50000;
const SETTLE_MS = 650;

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * The drop's reach, edited in section 1 where the money is.
 *
 * Every slot price, the print cost, the curation cut and the manifest hang off
 * this number, and all of them move as it is typed — there is no Apply button,
 * because confirming a number you can already see the consequences of is a step
 * that buys nothing. The write to the backend waits for typing to settle.
 *
 * It locks once a slot is paid or the drop is at the printer: at that point
 * somebody has bought a stated reach.
 */
export const ReachControl: React.FC<ReachControlProps> = ({
  campaign,
  onResize,
  onDraftChange,
  isSaving,
}) => {
  const { t } = useTranslation(['common']);
  const current = campaign.totalTargetHouseholds;
  const [draft, setDraft] = useState(String(current));
  const timer = useRef<number | undefined>(undefined);
  // The ZIP's smallest carrier route: the smallest drop it can physically take.
  const [floor, setFloor] = useState<number | null>(null);
  const [floorFailed, setFloorFailed] = useState(false);
  const [floorLoading, setFloorLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setFloorFailed(false);
    setFloorLoading(true);
    getReachFloor(campaign.targetZip)
      .then((f) => alive && setFloor(f.smallestRoute))
      .catch(() => alive && setFloorFailed(true))
      .finally(() => alive && setFloorLoading(false));
    return () => {
      alive = false;
    };
  }, [campaign.targetZip]);

  const min = floor ?? MIN;

  // Follow the campaign when it changes underneath: a different campaign
  // opened, or a commit landing with a value the backend adjusted.
  useEffect(() => {
    setDraft(String(current));
  }, [current, campaign.id]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const paid = campaign.slots.filter(
    (s) => s.status === 'PAID' && s.format !== 'USPS' && s.slotNumber !== 32,
  ).length;
  const inProduction = campaign.status === 'IN_PRODUCTION' || campaign.status === 'MAILED';
  const locked = paid > 0 || inProduction;

  const next = Number(draft);
  const valid = Number.isFinite(next) && next >= min && next <= MAX;
  const pending = valid && next !== current;
  const curated = campaign.curatedCount ?? 0;

  const handleChange = (raw: string) => {
    setDraft(raw);
    window.clearTimeout(timer.current);

    const parsed = Number(raw);
    const ok = Number.isFinite(parsed) && parsed >= min && parsed <= MAX;
    onDraftChange(ok ? parsed : null);
    if (!ok || parsed === current) return;

    timer.current = window.setTimeout(() => onResize(parsed), SETTLE_MS);
  };

  const handleBlur = () => {
    window.clearTimeout(timer.current);
    const parsed = Number(draft);
    let clamped: number;

    if (!Number.isFinite(parsed) || parsed < min) {
      clamped = min;
    } else if (parsed > MAX) {
      clamped = MAX;
    } else {
      clamped = Math.round(parsed);
    }

    setDraft(String(clamped));
    onDraftChange(null);
    if (clamped !== current) {
      onResize(clamped);
    }
  };

  return (
    <section data-tour="reach" className="mb-5 border border-rule bg-background">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 py-3">
        <div>
          <label className="field-label" htmlFor="campaign-reach">
            {t('common:reach.label')}
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              id="campaign-reach"
              type="number"
              inputMode="numeric"
              min={min}
              max={MAX}
              step={5}
              value={draft}
              disabled={locked}
              onChange={(e) => handleChange(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleBlur();
                  e.currentTarget.blur();
                }
              }}
              aria-describedby="campaign-reach-note"
              aria-invalid={!valid}
              className={`field-value w-32 border bg-card px-3 py-2 text-sm disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                valid ? 'border-rule' : 'border-due'
              }`}
            />
            <span className="field-label">{t('common:reach.unit')}</span>
            {(isSaving || pending) && !locked && (
              <span className="field-label text-live">{t('common:form.saving')}</span>
            )}
          </div>
        </div>

        <dl className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <dt className="field-label">{t('common:reach.currentCost')}</dt>
            <dd className="field-value mt-0.5 text-sm text-ink">
              {money(dropCostUsd(valid ? { ...campaign, totalTargetHouseholds: next } : campaign))}
            </dd>
          </div>
          <div>
            <dt className="field-label">{t('common:reach.perPiece')}</dt>
            <dd className="field-value mt-0.5 text-sm text-ink-dim">
              ${(campaign.unitCostUsd ?? 0.6).toFixed(2)}
            </dd>
          </div>
        </dl>
      </div>

      <p
        id="campaign-reach-note"
        aria-live="polite"
        className="border-t border-rule px-4 py-2.5 text-xs leading-relaxed text-ink-dim"
      >
        {locked
          ? inProduction
            ? t('common:reach.lockedProduction')
            : t('common:reach.lockedPaid', { count: paid })
          : !valid
            ? t('common:reach.invalid', {
                min: min.toLocaleString('en-US'),
                max: MAX.toLocaleString('en-US'),
              })
            : curated > 0 && pending
              ? t('common:reach.previewCurated', { count: curated.toLocaleString('en-US') })
              : floor
                ? t('common:reach.hintFloor', {
                    floor: floor.toLocaleString('en-US'),
                    zip: campaign.targetZip,
                  })
                : floorFailed
                  ? t('common:reach.hintNoFloor', { zip: campaign.targetZip })
                  : floorLoading
                    ? t('common:reach.hintLoading', { zip: campaign.targetZip })
                    : t('common:reach.hint')}
      </p>
    </section>
  );
};
