import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ExternalLink, Loader2, PlugZap, X } from 'lucide-react';
import { AppMode } from '../hooks/useAppMode.ts';
import {
  DataSource,
  MarketReference,
  SourceTest,
  applyMarketPreset,
  getMarketReference,
  listDataSources,
  setDataSourceEnabled,
  testDataSource,
} from '../services/settingsService.ts';

interface SettingsProps {
  open: boolean;
  mode: AppMode;
  /** Reach the market preset is previewed at. */
  households: number;
  onClose: () => void;
  /** Called after a preset is applied so the open campaign re-reads its costs. */
  onCostsChanged: () => void;
}

type Tab = 'SOURCES' | 'MARKET';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Where the data comes from and what it costs.
 *
 * Two questions the operator keeps asking get answered in one place: which
 * sources are switched on for this world and whether their keys are actually
 * there, and what the market charges for the things nobody quotes until you
 * ask. It is per world on purpose — practice runs on what is free, live runs on
 * what is licensed — and every paid source says what it costs before it is
 * switched on.
 */
export const Settings: React.FC<SettingsProps> = ({
  open,
  mode,
  households,
  onClose,
  onCostsChanged,
}) => {
  const { t } = useTranslation(['common']);
  const [tab, setTab] = useState<Tab>('SOURCES');
  const [sources, setSources] = useState<DataSource[]>([]);
  const [market, setMarket] = useState<MarketReference | null>(null);
  const [tests, setTests] = useState<Record<string, SourceTest>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    listDataSources(mode)
      .then(setSources)
      .catch((e) => setError(String(e)));
    getMarketReference()
      .then(setMarket)
      .catch(() => setMarket(null));
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const toggle = async (source: DataSource) => {
    try {
      const next = await setDataSourceEnabled(mode, source.id, !source.enabled);
      setSources((prev) => prev.map((s) => (s.id === next.id ? next : s)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runTest = async (source: DataSource) => {
    setTesting(source.id);
    try {
      const result = await testDataSource(source.id, 5);
      setTests((prev) => ({ ...prev, [source.id]: result }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(null);
    }
  };

  const loadPreset = async () => {
    setApplying(true);
    try {
      await applyMarketPreset(mode, households);
      onCostsChanged();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-background/70 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('common:settings.title')}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[36rem] flex-col border-l border-rule-strong bg-background shadow-2xl"
      >
        <header className="border-b border-rule-strong px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="imperative text-sm text-ink">{t('common:settings.title')}</h2>
              <p className="mt-0.5 font-mono text-[0.63rem] text-ink-faint">
                {t(mode === 'LIVE' ? 'common:settings.scopeLive' : 'common:settings.scopeDemo')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common:settings.close')}
              className="flex min-h-11 min-w-11 items-center justify-center text-ink-dim transition-colors hover:bg-secondary hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div role="tablist" className="mt-2 flex gap-px">
            {(['SOURCES', 'MARKET'] as Tab[]).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`field-label flex min-h-11 items-center px-3 transition-colors ${
                  tab === id
                    ? 'bg-secondary text-ink'
                    : 'text-ink-dim hover:bg-secondary hover:text-ink'
                }`}
              >
                {t(`common:settings.tab.${id.toLowerCase()}`)}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {error && (
            <p className="mb-3 border border-due/50 bg-due/10 px-3 py-2 text-xs text-due">
              {error}
            </p>
          )}

          {tab === 'SOURCES' ? (
            <>
              <p className="text-xs leading-relaxed text-ink-dim">
                {t('common:settings.sourcesIntro')}
              </p>

              <ul className="mt-4 space-y-3">
                {sources.map((s) => {
                  const result = tests[s.id];
                  return (
                    <li key={s.id} className="border border-rule bg-card">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-rule px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="field-value text-sm text-ink">{s.name}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span
                              className={`field-label ${s.cost === 'FREE' ? 'text-clear' : 'text-live'}`}
                            >
                              {t(`common:settings.cost.${s.cost.toLowerCase()}`)}
                            </span>
                            {s.envKey && (
                              <span
                                className={`field-label ${s.configured ? 'text-clear' : 'text-due'}`}
                              >
                                {s.configured
                                  ? t('common:settings.keyOk')
                                  : t('common:settings.keyMissing', { key: s.envKey })}
                              </span>
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={s.enabled}
                          onClick={() => toggle(s)}
                          className={`field-label min-h-11 shrink-0 border px-3 transition-colors ${
                            s.enabled
                              ? 'border-clear bg-clear/15 text-clear'
                              : 'border-rule text-ink-dim hover:bg-secondary'
                          }`}
                        >
                          {t(s.enabled ? 'common:settings.on' : 'common:settings.off')}
                        </button>
                      </div>

                      <div className="space-y-1.5 px-3 py-2.5">
                        <p className="text-xs leading-relaxed text-ink">
                          <span className="field-label mr-1.5 text-clear">
                            {t('common:settings.gives')}
                          </span>
                          {s.gives}
                        </p>
                        <p className="text-xs leading-relaxed text-ink-dim">
                          <span className="field-label mr-1.5 text-due">
                            {t('common:settings.lacks')}
                          </span>
                          {s.lacks}
                        </p>
                        <p className="text-[0.69rem] leading-relaxed text-ink-faint">{s.note}</p>

                        <div className="flex flex-wrap items-center gap-3 pt-1.5">
                          <button
                            type="button"
                            onClick={() => runTest(s)}
                            disabled={testing === s.id}
                            className="field-label flex min-h-11 items-center gap-1.5 border border-rule px-3 text-ink-dim transition-colors hover:bg-secondary hover:text-ink disabled:opacity-40"
                          >
                            {testing === s.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <PlugZap className="h-3.5 w-3.5" />
                            )}
                            {t('common:settings.test')}
                          </button>
                          {s.url && (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="field-label flex min-h-11 items-center gap-1.5 text-live transition-colors hover:text-ink"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {t('common:settings.openSite')}
                            </a>
                          )}
                        </div>

                        {result && (
                          <div
                            className={`mt-1 border px-2.5 py-2 text-xs leading-relaxed ${
                              result.ok
                                ? 'border-clear/50 bg-clear/10 text-clear'
                                : 'border-due/50 bg-due/10 text-due'
                            }`}
                          >
                            <p className="flex items-start gap-1.5">
                              {result.ok && (
                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              )}
                              <span>{result.detail}</span>
                            </p>
                            {result.sample.length > 0 && (
                              <pre className="mt-1.5 max-h-40 overflow-auto border-t border-current/20 pt-1.5 font-mono text-[0.63rem] text-ink-dim">
                                {JSON.stringify(result.sample.slice(0, 3), null, 1)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-ink-dim">
                {t('common:settings.marketIntro', { date: market?.updated ?? '—' })}
              </p>

              {market && (
                <>
                  <dl className="mt-4 divide-y divide-rule border-y border-rule">
                    {market.lines.map((line) => (
                      <div key={line.id} className="py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                          <dt className="field-label text-ink">{line.label}</dt>
                          <dd className="field-value text-sm text-ink">
                            ${line.suggested.toFixed(3)}
                            {line.low !== line.high && (
                              <span className="field-label ml-2 text-ink-faint">
                                ${line.low.toFixed(3)} – ${line.high.toFixed(3)}
                              </span>
                            )}
                          </dd>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-ink-dim">{line.basis}</p>
                        <p className="mt-0.5 font-mono text-[0.63rem] text-ink-faint">
                          {line.source}
                        </p>
                      </div>
                    ))}
                  </dl>

                  <button
                    id="btn-apply-market-preset"
                    type="button"
                    onClick={loadPreset}
                    disabled={applying}
                    className="imperative mt-4 flex min-h-11 w-full items-center justify-center gap-2 border border-live px-4 text-[0.69rem] text-live transition-colors hover:bg-live hover:text-primary-foreground disabled:opacity-40"
                  >
                    {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t('common:settings.applyPreset', {
                      mode: t(`common:mode.${mode.toLowerCase()}`),
                    })}
                  </button>
                  <p className="mt-1.5 text-[0.69rem] leading-relaxed text-ink-faint">
                    {t('common:settings.applyPresetNote')}
                  </p>

                  <h3 className="field-label mt-6 border-t border-rule pt-4 text-ink">
                    {t('common:settings.dataAxleTitle')}
                  </h3>
                  <table className="mt-2 w-full border border-rule text-xs">
                    <thead>
                      <tr className="border-b border-rule bg-card">
                        <th className="field-label px-2.5 py-2 text-left">
                          {t('common:settings.plan')}
                        </th>
                        <th className="field-label px-2.5 py-2 text-right">
                          {t('common:settings.monthly')}
                        </th>
                        <th className="field-label px-2.5 py-2 text-right">
                          {t('common:settings.commitment')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {market.dataAxlePlans.map((p) => (
                        <tr key={p.plan} className="border-b border-rule last:border-b-0">
                          <td className="px-2.5 py-2 text-ink">{p.plan}</td>
                          <td className="field-value px-2.5 py-2 text-right text-ink">
                            {money(p.monthly)}
                          </td>
                          <td className="field-value px-2.5 py-2 text-right text-ink-dim">
                            {money(p.annualCommitment)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs leading-relaxed text-ink-dim">{market.dataAxleNote}</p>
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
};
