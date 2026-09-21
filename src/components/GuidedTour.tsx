import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface TourStep {
  /** `data-tour` value of the element this step points at. */
  target: string;
  /** i18n key under `common:tour.` for the step's heading. */
  titleKey: string;
  /** i18n key under `common:tour.` for the step's body. */
  bodyKey: string;
}

interface GuidedTourProps {
  /** Stored in localStorage so a finished tour does not run again. */
  tourId: string;
  steps: TourStep[];
  /** True to run it now; the caller owns first-run and replay. */
  active: boolean;
  onClose: () => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const GAP = 14;
const CALLOUT_W = 340;

export function hasSeenTour(tourId: string): boolean {
  try {
    return localStorage.getItem(`tour:${tourId}`) === 'done';
  } catch {
    // Private windows and blocked site data throw here; a tour that cannot
    // remember it ran is better than a crash.
    return true;
  }
}

export function markTourSeen(tourId: string): void {
  try {
    localStorage.setItem(`tour:${tourId}`, 'done');
  } catch {
    /* nothing to do: the tour simply offers itself again */
  }
}

/**
 * A first-run walkthrough: the screen dims, one control stays lit, and a ruled
 * note points at it saying what it is for. Five short steps, once, with an exit
 * on every one — a tour nobody can leave is a worse interface than no tour.
 */
export const GuidedTour: React.FC<GuidedTourProps> = ({ tourId, steps, active, onClose }) => {
  const { t } = useTranslation(['common']);
  const [index, setIndex] = useState(0);
  /**
   * The steps that have something to point at right now. Resolved when the tour
   * opens: an empty file has no featured campaign, and section 1's controls are
   * not on screen while another section is open.
   */
  const [liveSteps, setLiveSteps] = useState<TourStep[]>(steps);
  const [box, setBox] = useState<Box | null>(null);
  // The note's height changes with the copy and the language, so it is
  // measured rather than estimated: a guessed height put it 7px off-screen.
  const [calloutH, setCalloutH] = useState(230);
  const calloutRef = useRef<HTMLDivElement | null>(null);

  const step = liveSteps[index];

  useEffect(() => {
    if (!active) return;
    const present = steps.filter((s) => document.querySelector(`[data-tour="${s.target}"]`));
    setLiveSteps(present.length ? present : steps);
    setIndex(0);
  }, [active, steps]);

  // Measuring and scrolling are kept apart on purpose: measure() runs on every
  // scroll event, so scrolling from inside it would drive the page against
  // itself and leave the highlight on stale coordinates.
  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  // Bring the step's target into view once, when the step changes.
  useEffect(() => {
    if (!active || !step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const needsScroll = r.top < GAP || r.bottom > window.innerHeight - calloutH - GAP * 2;
    if (needsScroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, step]);

  useLayoutEffect(() => {
    if (!active) return;
    measure();
    // The highlight follows the element it names through the scroll, so it
    // never drifts off the control it is pointing at.
    let frame = 0;
    const onChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [active, measure]);

  const finish = useCallback(() => {
    markTourSeen(tourId);
    setIndex(0);
    onClose();
  }, [tourId, onClose]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight' && index < liveSteps.length - 1) setIndex((i) => i + 1);
      if (e.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, finish, index, liveSteps.length]);

  useEffect(() => {
    if (active) calloutRef.current?.focus();
  }, [active, index]);

  useLayoutEffect(() => {
    if (active && calloutRef.current) setCalloutH(calloutRef.current.offsetHeight);
  }, [active, index, box, t]);

  if (!active || !step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Place the note under the lit control when there is room, otherwise above,
  // then clamp so it always lands fully inside the viewport.
  const below = box ? box.top + box.height + GAP : vh / 2;
  const placeBelow = !box || below + calloutH + GAP <= vh;
  const preferredTop = box
    ? placeBelow
      ? below
      : box.top - GAP - calloutH
    : vh / 2 - calloutH / 2;
  const calloutTop = Math.min(Math.max(GAP, preferredTop), Math.max(GAP, vh - calloutH - GAP));
  const rawLeft = box ? box.left + box.width / 2 - CALLOUT_W / 2 : vw / 2 - CALLOUT_W / 2;
  const calloutLeft = Math.min(Math.max(GAP, rawLeft), vw - CALLOUT_W - GAP);
  const arrowLeft = box
    ? Math.min(Math.max(18, box.left + box.width / 2 - calloutLeft - 7), CALLOUT_W - 32)
    : CALLOUT_W / 2 - 7;

  return (
    <div
      className="fixed inset-0 z-[100] overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label={t('common:tour.label')}
    >
      {/* The lit control. A huge spread shadow dims everything except this box. */}
      {box ? (
        <div
          className="pointer-events-none absolute border-2 border-live transition-colors duration-300"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(4, 6, 9, 0.78)',
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(4, 6, 9, 0.78)' }} />
      )}

      <div
        ref={calloutRef}
        tabIndex={-1}
        className="absolute border border-live bg-card p-4 shadow-none outline-none"
        style={{ top: calloutTop, left: calloutLeft, width: CALLOUT_W }}
      >
        {/* The arrow: a rotated square sitting on the callout's edge. */}
        {box && (
          <span
            aria-hidden="true"
            className="absolute h-3 w-3 rotate-45 border-live bg-card"
            style={
              placeBelow
                ? { top: -7, left: arrowLeft, borderTopWidth: 1, borderLeftWidth: 1 }
                : { bottom: -7, left: arrowLeft, borderBottomWidth: 1, borderRightWidth: 1 }
            }
          />
        )}

        <p className="field-label text-live">
          {t('common:tour.step', { current: index + 1, total: liveSteps.length })}
        </p>
        <h2 className="imperative mt-1.5 text-sm text-ink">{t(`common:tour.${step.titleKey}`)}</h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-dim">
          {t(`common:tour.${step.bodyKey}`)}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-rule pt-3">
          <button
            type="button"
            onClick={finish}
            className="field-label transition-colors hover:text-ink"
          >
            {t('common:tour.skip')}
          </button>

          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="field-label border border-rule px-3 py-2 transition-colors hover:border-rule-strong hover:text-ink"
              >
                {t('common:tour.back')}
              </button>
            )}
            <button
              id="btn-tour-next"
              type="button"
              onClick={() => (index < liveSteps.length - 1 ? setIndex((i) => i + 1) : finish())}
              className="imperative border border-live bg-live px-3.5 py-2 text-[0.69rem] text-primary-foreground transition-opacity hover:opacity-90"
            >
              {index < liveSteps.length - 1 ? t('common:tour.next') : t('common:tour.done')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * The drawer: what this screen is and where the work starts.
 *
 * Steps whose target is not on the screen are dropped before the tour runs, so
 * the same list serves an empty file and a full one: with nothing filed yet
 * there is no featured campaign to point at, and a note floating over the middle
 * of a blank page explains nothing. What remains is still a complete account of
 * the screen the operator is actually looking at.
 */
export const FILE_TOUR: TourStep[] = [
  { target: 'file-title', titleKey: 'file1.title', bodyKey: 'file1.body' },
  { target: 'mode-switch', titleKey: 'file1b.title', bodyKey: 'file1b.body' },
  { target: 'lead-imperative', titleKey: 'file2.title', bodyKey: 'file2.body' },
  { target: 'lead-strip', titleKey: 'file3.title', bodyKey: 'file3.body' },
  { target: 'owed', titleKey: 'file4.title', bodyKey: 'file4.body' },
  { target: 'file-filters', titleKey: 'file6.title', bodyKey: 'file6.body' },
  { target: 'row-actions', titleKey: 'file7.title', bodyKey: 'file7.body' },
  { target: 'new-campaign', titleKey: 'file5.title', bodyKey: 'file5.body' },
  { target: 'assistant', titleKey: 'file8.title', bodyKey: 'file8.body' },
];

/** Inside a campaign: the gated sections, the money, and the card itself. */
export const FORM_TOUR: TourStep[] = [
  { target: 'form-imperative', titleKey: 'form1.title', bodyKey: 'form1.body' },
  { target: 'form-section-open', titleKey: 'form2.title', bodyKey: 'form2.body' },
  { target: 'form-section-locked', titleKey: 'form3.title', bodyKey: 'form3.body' },
  { target: 'reach', titleKey: 'form5.title', bodyKey: 'form5.body' },
  { target: 'costs', titleKey: 'form6.title', bodyKey: 'form6.body' },
  { target: 'canvas', titleKey: 'form7.title', bodyKey: 'form7.body' },
  { target: 'assistant', titleKey: 'form8.title', bodyKey: 'form8.body' },
  { target: 'form-back', titleKey: 'form4.title', bodyKey: 'form4.body' },
];
