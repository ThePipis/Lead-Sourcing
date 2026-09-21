import React from 'react';
import { useTranslation } from 'react-i18next';
import { AppMode } from '../hooks/useAppMode.ts';

interface ModeSwitchProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  /** Campaigns currently listed, shown so the switch says what it will reveal. */
  demoCount: number;
  liveCount: number;
}

/**
 * The app's world selector. It changes which campaigns exist on screen and
 * whether lead sourcing and curation hit mocks or the real services, so it is
 * printed on the form rather than hidden in a settings menu.
 */
export const ModeSwitch: React.FC<ModeSwitchProps> = ({
  mode,
  onChange,
  demoCount,
  liveCount,
}) => {
  const { t } = useTranslation(['common']);

  const options: { id: AppMode; count: number }[] = [
    { id: 'LIVE', count: liveCount },
    { id: 'DEMO', count: demoCount },
  ];

  return (
    <div
      className={`border ${mode === 'LIVE' ? 'border-clear/60' : 'border-live/60'} bg-card`}
    >
      <div
        role="radiogroup"
        aria-label={t('common:mode.label')}
        className="flex items-stretch divide-x divide-rule border-b border-rule"
      >
        {options.map((opt) => {
          const selected = mode === opt.id;
          return (
            <button
              key={opt.id}
              id={`btn-mode-${opt.id.toLowerCase()}`}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.id)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 px-4 text-center transition-colors ${
                selected
                  ? opt.id === 'LIVE'
                    ? 'bg-clear text-background'
                    : 'bg-live text-primary-foreground'
                  : 'text-ink-dim hover:bg-secondary hover:text-ink'
              }`}
            >
              <span className="imperative text-[0.69rem]">
                {t(`common:mode.${opt.id.toLowerCase()}`)}
              </span>
              <span className="font-mono text-[0.63rem] tabular-nums opacity-80">
                {opt.count}
              </span>
            </button>
          );
        })}
      </div>

      <p
        aria-live="polite"
        className="px-4 py-2.5 text-xs leading-relaxed text-ink-dim"
      >
        {t(`common:mode.${mode === 'LIVE' ? 'liveHint' : 'demoHint'}`)}
      </p>
    </div>
  );
};
