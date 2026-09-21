import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Campaign } from '../types.ts';
import { CampaignProgress, PhaseId, PhaseState } from '../workflow.ts';

interface FormShellProps {
  campaign: Campaign;
  /** Replays the form's walkthrough; it is only offered here, never forced. */
  onReplayTour: () => void;
  progress: CampaignProgress;
  /** Section the operator is looking at. */
  activePhase: PhaseId;
  onSelectPhase: (phase: PhaseId) => void;
  onBackToFile: () => void;
  expertMode: boolean;
  isSyncing: boolean;
  /** When the last write landed on disk; null until the first one does. */
  lastSavedAt?: Date | null;
  /** Rendered inside whichever section is open. */
  renderSection: (phase: PhaseId) => React.ReactNode;
  children?: React.ReactNode;
}

/** Day-first and spelled month, the way a datestamp reads, in the UI's language. */
const stampDate = (iso: string | undefined, locale: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d
    .toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase();
};

/**
 * One campaign, one acceptance form. Sections are numbered, worked in order,
 * and a shut gate says what it is waiting for instead of simply refusing.
 */
export const FormShell: React.FC<FormShellProps> = ({
  campaign,
  progress,
  activePhase,
  onSelectPhase,
  onReplayTour,
  onBackToFile,
  expertMode,
  isSyncing,
  lastSavedAt = null,
  renderSection,
  children,
}) => {
  const { t, i18n } = useTranslation(['common']);
  const activeRef = useRef<HTMLDivElement | null>(null);
  const previousPhase = useRef(activePhase);

  // The stamp lands only when a section is actually sealed in front of the
  // operator. Sections already done when the form opened stay still: an
  // identical entrance on every section is wallpaper, not a moment.
  const settled = useRef<Set<PhaseId> | null>(null);
  const justStamped = useRef<Set<PhaseId>>(new Set());
  const unlockedAtOpen = useRef<Set<PhaseId> | null>(null);
  const justUnlocked = useRef<Set<PhaseId>>(new Set());
  if (settled.current === null) {
    settled.current = new Set(progress.phases.filter((p) => p.done).map((p) => p.id));
  }
  if (unlockedAtOpen.current === null) {
    unlockedAtOpen.current = new Set(progress.phases.filter((p) => p.open).map((p) => p.id));
  }
  for (const phase of progress.phases) {
    if (phase.done && !settled.current.has(phase.id)) {
      settled.current.add(phase.id);
      justStamped.current.add(phase.id);
    }
    if (phase.open && !unlockedAtOpen.current.has(phase.id)) {
      unlockedAtOpen.current.add(phase.id);
      justUnlocked.current.add(phase.id);
    }
  }

  // Move to the section the operator just opened, but never yank the page on
  // first paint or while they are reading the one they are already in.
  useEffect(() => {
    if (previousPhase.current !== activePhase) {
      activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      previousPhase.current = activePhase;
    }
  }, [activePhase]);

  const firstOpen = progress.phases.find((p) => p.open && !p.done)?.id;
  const firstLocked = progress.phases.find((p) => !p.open)?.id;

  const sectionDate = (phase: PhaseId): string | null => {
    if (phase === 'manifest') return stampDate(campaign.productionAt, i18n.language);
    if (phase === 'production') return stampDate(campaign.mailedAt, i18n.language);
    return null;
  };

  return (
    <div className="w-full px-3 pb-24 sm:px-6 lg:px-8">
      <header className="sticky top-0 z-20 -mx-3 border-b border-rule-strong bg-background/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-2 sm:gap-x-6 gap-y-2">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              id="btn-back-to-file"
              data-tour="form-back"
              type="button"
              onClick={onBackToFile}
              className="field-label transition-colors hover:text-ink"
            >
              ← {t('common:form.backToFile')}
            </button>
            <span className="h-4 w-px bg-rule" aria-hidden="true" />
            <span className="field-value text-sm text-ink">{campaign.code}</span>
            <span className="field-label hidden sm:inline">
              {campaign.targetCity} · {campaign.targetZip}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <SyncBadge isSyncing={isSyncing} lastSavedAt={lastSavedAt} locale={i18n.language} />
            {expertMode && (
              <span
                className="field-label border border-due px-1.5 py-0.5 text-due"
                title={t('common:form.expertHint')}
              >
                {t('common:form.expert')}
              </span>
            )}
            {children}
          </div>
        </div>

        <p data-tour="form-imperative" className="imperative mt-2 text-sm text-live">
          {t(`common:${progress.imperativeKey}`, progress.imperativeParams)}
        </p>
      </header>

      <ol className="mt-6">
        {progress.phases.map((phase) => {
          const isActive = phase.id === activePhase;
          const unlocked = phase.open || expertMode;

          return (
            <li key={phase.id}>
              <SectionHeader
                tour={
                  phase.id === firstOpen
                    ? 'form-section-open'
                    : phase.id === firstLocked
                      ? 'form-section-locked'
                      : undefined
                }
                phase={phase}
                isActive={isActive}
                unlocked={unlocked}
                stamped={sectionDate(phase.id)}
                landing={justStamped.current.has(phase.id)}
                opening={justUnlocked.current.has(phase.id)}
                onSelect={() => unlocked && onSelectPhase(phase.id)}
              />
              {isActive && unlocked && (
                <div
                  ref={activeRef}
                  className="border-x border-b border-rule bg-card px-3 py-4 sm:px-5 min-w-0"
                >
                  {renderSection(phase.id)}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* The walkthrough runs once by itself; from then on it lives here. A tour
          you cannot ask for again is a tour you only get when you least need
          it — the first time you open the screen. */}
      <div className="mt-6 flex justify-end border-t border-rule pt-3">
        <button
          id="btn-replay-form-tour"
          type="button"
          onClick={onReplayTour}
          className="field-label min-h-11 px-2 text-live transition-colors hover:text-ink"
        >
          {t('common:tour.replay')}
        </button>
      </div>
    </div>
  );
};

/**
 * The only thing the operator is told about saving.
 *
 * There is no save button: every field writes itself once typing settles. What
 * a person needs from that is not reassurance in the abstract but a time — if
 * the stamp says a moment ago, the work is on disk.
 */
const SyncBadge: React.FC<{
  isSyncing: boolean;
  lastSavedAt: Date | null;
  locale: string;
}> = ({ isSyncing, lastSavedAt, locale }) => {
  const { t } = useTranslation(['common']);
  if (isSyncing) {
    return (
      <span className="field-label flex items-center gap-1.5 text-live">
        <span className="h-1.5 w-1.5 animate-pulse bg-live" aria-hidden="true" />
        {t('common:form.saving')}
      </span>
    );
  }
  if (!lastSavedAt) return null;
  return (
    <span
      id="sync-badge"
      className="field-label flex items-center gap-1.5 text-ink-faint"
      title={t('common:form.savedTitle')}
    >
      <span className="h-1.5 w-1.5 bg-clear" aria-hidden="true" />
      {t('common:form.savedAt', {
        time: lastSavedAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
      })}
    </span>
  );
};

const SectionHeader: React.FC<{
  phase: PhaseState;
  isActive: boolean;
  unlocked: boolean;
  stamped: string | null;
  /** This section was sealed just now, not before the form was opened. */
  landing: boolean;
  /** This section's gate opened just now. */
  opening: boolean;
  /** `data-tour` anchor, when the walkthrough points at this section. */
  tour?: string;
  onSelect: () => void;
}> = ({ phase, isActive, unlocked, stamped, landing, opening, tour, onSelect }) => {
  const { t } = useTranslation(['common']);

  return (
    <button
      id={`section-${phase.id}`}
      data-tour={tour}
      type="button"
      onClick={onSelect}
      disabled={!unlocked}
      aria-expanded={isActive}
      aria-current={isActive ? 'step' : undefined}
      className={`flex w-full items-center gap-4 border border-rule px-4 py-3 text-left transition-colors ${
        isActive ? 'border-b-0 bg-card' : 'bg-background hover:bg-secondary'
      } ${!unlocked ? 'reserved cursor-not-allowed' : ''} ${
        phase.number > 1 ? '-mt-px' : ''
      } ${opening ? 'gate-open' : ''}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center border font-mono text-xs tabular-nums ${
          phase.done
            ? 'border-clear bg-clear text-background'
            : unlocked
              ? isActive
                ? 'border-live text-live'
                : 'border-rule-strong text-ink-dim'
              : 'reserved border-rule text-ink-faint'
        }`}
      >
        {phase.number}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`imperative block text-xs ${
            unlocked ? (isActive ? 'text-ink' : 'text-ink-dim') : 'text-ink-faint'
          }`}
        >
          {t(`common:form.section.${phase.id}`)}
        </span>
        <span className="mt-0.5 block font-mono text-[0.69rem] leading-snug tabular-nums text-ink-dim">
          {unlocked
            ? t(`common:${phase.summaryKey}`, phase.summaryParams)
            : t(`common:${phase.blockedKey}`, phase.blockedParams)}
        </span>
      </span>

      {stamped && phase.done && (
        <span
          className={`flex size-12 shrink-0 -rotate-[1.5deg] items-center justify-center rounded-full border-2 border-clear text-center font-mono text-clear sm:size-14 ${
            landing ? 'stamp-land' : ''
          }`}
        >
          <span className="block leading-[1.15]">
            <span className="block text-[0.38rem] tracking-[0.12em] sm:text-[0.44rem]">
              {t('common:form.stamped')}
            </span>
            <span className="mt-px block border-y border-clear py-px text-[0.44rem] tabular-nums sm:text-[0.5rem]">
              {stamped.split(' ')[0]} {stamped.split(' ')[1]}
            </span>
            <span className="block text-[0.44rem] tabular-nums sm:text-[0.5rem]">
              {stamped.split(' ')[2]}
            </span>
          </span>
        </span>
      )}

      {!unlocked && (
        <span className="field-label shrink-0 text-ink-faint">{t('common:form.reserved')}</span>
      )}
    </button>
  );
};
