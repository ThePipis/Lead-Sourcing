import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, KeyRound, Loader2, Radar, RefreshCw } from 'lucide-react';
import {
  CensusUnavailableError,
  RoutePlan,
  getCampaignRoutes,
  planCampaignRoutes,
  toggleCampaignRoute,
} from '../services/routeService.ts';

interface RouteEngineProps {
  campaignId: string;
  targetZip: string;
  targetHouseholds: number;
  /** Reports the covered count upward so the ledger and the card follow it. */
  onCoverageChange: (covered: number, routeCount: number, missing: string[], replanned?: boolean) => void;
  /** Written down when the operator continues on a model that scored short. */
  onAcknowledgeModel?: () => void;
  /** The acknowledgement already on file, if any: "<stamp>|<missing>". */
  modelAck?: string | null;
}

/** A census failure, whichever copy of the class it was thrown from. */
function isCensusUnavailable(e: unknown): e is CensusUnavailableError {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { name?: string }).name === 'CensusUnavailableError' &&
    typeof (e as { reason?: unknown }).reason === 'string'
  );
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * The audience, as carrier routes.
 *
 * A cooperative card is delivered by saturation: every box on the route,
 * addressed to "Postal Customer". So this is where the audience is decided, and
 * it decides it in routes rather than in households — which is also why no
 * licensed consumer file is needed to mail the drop.
 *
 * Switching a route in or out is the live control of the whole campaign: the
 * household count on the card's postal zone, the postage in the ledger and the
 * margin against the fourteen slots all move with it.
 */
export const RouteEngine: React.FC<RouteEngineProps> = ({
  campaignId,
  targetZip,
  targetHouseholds,
  onCoverageChange,
  onAcknowledgeModel,
  modelAck = null,
}) => {
  const { t } = useTranslation(['curation', 'common']);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const zip = targetZip;
  const target = String(targetHouseholds);
  const [isPlanning, setIsPlanning] = useState(false);
  const [busyRoute, setBusyRoute] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Measured over the routes in the drop, not over every route in the ZIP: a
  // gap on a route nobody bought is not a gap in what was sold.
  const MODEL_VARS = [
    'income',
    'owner_occupied',
    'single_family',
    'vehicles',
    'home_value',
    'household_size',
  ] as const;
  // Same rule as the backend's model_missing; the campaign's copy of it is
  // refreshed from here, so the phase gate never judges a stale plan.
  const missingIn = (p: RoutePlan) => {
    const picked = p.routes.filter((r) => r.selected);
    return picked.length ? MODEL_VARS.filter((v) => !picked.every((r) => r.scoredOn.includes(v))) : [];
  };
  const shortVars = plan ? missingIn(plan) : [];
  const acknowledged = Boolean(modelAck);
  // The census could not answer and no plan was written. Held apart from the
  // generic error because it is the one failure with a remedy the operator can
  // carry out right now.
  const [censusDown, setCensusDown] = useState<{ reason: string; message: string } | null>(null);

  // Whatever was planned before is the campaign's audience until it is replanned.
  useEffect(() => {
    let alive = true;
    getCampaignRoutes(campaignId)
      .then((p) => {
        if (!alive || p.routes.length === 0) return;
        setPlan(p);
        onCoverageChange(p.covered, p.selectedRoutes, missingIn(p));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [campaignId]);

  const runPlan = async (degraded = false) => {
    const wanted = Number(target);
    if (!/^\d{5}$/.test(zip) || !Number.isFinite(wanted) || wanted < 100) return;
    setIsPlanning(true);
    setError(null);
    setCensusDown(null);
    try {
      const next = await planCampaignRoutes(campaignId, zip, wanted, degraded);
      setPlan(next);
      setCensusDown(null);
      onCoverageChange(next.covered, next.selectedRoutes, missingIn(next), true);
    } catch (e) {
      // Matched by shape, not by `instanceof`: the dev server re-evaluates
      // modules on edit, which mints a second copy of the class, and then the
      // identity check fails and the alarm silently degrades to a grey error
      // line. The shape survives that.
      if (isCensusUnavailable(e)) {
        setCensusDown({ reason: e.reason, message: e.message });
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setIsPlanning(false);
    }
  };

  const toggle = async (routeId: string, selected: boolean) => {
    setBusyRoute(routeId);
    try {
      const next = await toggleCampaignRoute(campaignId, routeId, selected);
      setPlan((prev) => (prev ? { ...next, target: prev.target, zipCode: prev.zipCode } : next));
      onCoverageChange(next.covered, next.selectedRoutes, missingIn(next));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyRoute(null);
    }
  };

  return (
    <section id="route-engine" className="mb-5 border border-rule bg-background">
      <div className="border-b border-rule px-4 py-3">
        <h3 className="field-label text-ink">{t('curation:routeEngine.title')}</h3>
        <p className="mt-1.5 max-w-[74ch] text-xs leading-relaxed text-ink-dim">
          {t('curation:routeEngine.intro')}
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label mb-1.5 block" htmlFor="route-zip">
              {t('curation:routeEngine.zip')}
            </label>
            <input
              id="route-zip"
              value={zip}
              inputMode="numeric"
              readOnly
              title={t('curation:routeEngine.lockedFromSales')}
              className="field-value w-28 cursor-not-allowed border border-rule bg-card px-3 py-2 text-sm text-ink opacity-60"
            />
          </div>
          <div>
            <label className="field-label mb-1.5 block" htmlFor="route-target">
              {t('curation:routeEngine.target')}
            </label>
            <input
              id="route-target"
              value={target}
              inputMode="numeric"
              readOnly
              title={t('curation:routeEngine.lockedFromSales')}
              className="field-value w-32 cursor-not-allowed border border-rule bg-card px-3 py-2 text-sm text-ink opacity-60"
            />
          </div>
          <button
            id="btn-plan-routes"
            type="button"
            onClick={() => runPlan(false)}
            disabled={isPlanning}
            className="imperative flex min-h-11 items-center gap-2 border border-live bg-live px-4 text-[0.69rem] text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPlanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Radar className="h-3.5 w-3.5" />
            )}
            {t(isPlanning ? 'curation:routeEngine.planning' : 'curation:routeEngine.plan')}
          </button>

        </div>

        {error && (
          <p className="mt-3 border border-due/50 bg-due/10 px-3 py-2 text-xs text-due">{error}</p>
        )}
      </div>

          {/* The census could not answer, so no plan was made and nothing was
              written. This is the one stop in the flow with a remedy the
              operator can carry out in the next two minutes, so it names the
              cause rather than guessing: a missing key, a rejected key and an
              outage each send them somewhere different, and "check your API
              key" during an outage costs an hour chasing a key that was fine. */}
          {censusDown && (
            <div
              id="census-down-alarm"
              role="alert"
              className="border border-due bg-due/10 p-4"
            >
              <p className="flex items-center gap-2 text-xs font-bold text-due uppercase tracking-wider">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t(`curation:census.title.${censusDown.reason}`, {
                  defaultValue: t('curation:census.title.UNREACHABLE'),
                })}
              </p>

              <p className="mt-2 max-w-[68ch] text-xs leading-relaxed text-foreground">
                {censusDown.message}
              </p>

              <p className="mt-2 max-w-[68ch] text-xs leading-relaxed text-ink-dim">
                {t('curation:census.why')}
              </p>

              {censusDown.reason !== 'UNREACHABLE' && censusDown.reason !== 'DISABLED' && (
                <ol className="mt-3 space-y-1 border-l-2 border-due/40 pl-3">
                  {(
                    t('curation:census.steps', { returnObjects: true }) as unknown as string[]
                  ).map((step, i) => (
                    <li key={i} className="font-mono text-[0.69rem] leading-relaxed text-ink-dim">
                      {i + 1}. {step}
                    </li>
                  ))}
                </ol>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  id="btn-census-retry"
                  type="button"
                  onClick={() => runPlan(false)}
                  disabled={isPlanning}
                  className="flex min-h-11 items-center gap-1.5 border border-live bg-live px-3 text-[0.69rem] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {isPlanning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {t('curation:census.retry')}
                </button>

                <a
                  href="https://api.census.gov/data/key_signup.html"
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center gap-1.5 border border-rule px-3 text-[0.69rem] font-bold text-ink-dim transition-colors hover:bg-secondary hover:text-ink"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {t('curation:census.getKey')}
                </a>

                <button
                  id="btn-census-degraded"
                  type="button"
                  onClick={() => runPlan(true)}
                  disabled={isPlanning}
                  className="min-h-11 px-2 text-[0.69rem] text-ink-faint underline transition-colors hover:text-ink disabled:opacity-40"
                  title={t('curation:census.degradedTitle')}
                >
                  {t('curation:census.degraded')}
                </button>
              </div>
            </div>
          )}

      {plan && plan.routes.length > 0 && (
        <>
          <dl className="grid grid-cols-2 gap-px border-b border-rule bg-rule sm:grid-cols-4">
            <Cell
              label={t('curation:routeEngine.covered')}
              value={plan.covered.toLocaleString('en-US')}
              tone="clear"
              id="route-covered"
            />
            <Cell
              label={t('curation:routeEngine.selectedRoutes')}
              value={`${plan.selectedRoutes}/${plan.availableRoutes}`}
            />
            <Cell
              label={t('curation:routeEngine.available')}
              value={plan.available.toLocaleString('en-US')}
            />
            <Cell
              label={t('curation:routeEngine.enrichment')}
              value={t(plan.censusEnriched ? 'curation:routeEngine.hybrid' : 'curation:routeEngine.uspsOnly')}
              tone={plan.censusEnriched ? 'clear' : undefined}
            />
          </dl>

          <p className="border-b border-rule px-4 py-2.5 text-xs leading-relaxed text-ink-dim">
            {plan.censusEnriched
              ? t('curation:routeEngine.hybridNote')
              : t('curation:routeEngine.uspsOnlyNote')}
          </p>

          {/* The alarm, not a note.
              Everything downstream — the pitch, the manifest, the profile —
              is sold as six variables. When the score came up short the
              operator has to meet that before section 3 opens, because the
              alternative is finding out in front of an advertiser. It can be
              passed deliberately; it cannot be passed by not looking. */}
          {shortVars.length > 0 && (
            <div
              id="model-incomplete-alert"
              role="alert"
              className="border-b border-due bg-due/10 px-4 py-3"
            >
              <p className="flex items-center gap-2 text-xs font-bold text-due uppercase tracking-wider">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t('curation:routeEngine.shortTitle', {
                  used: 6 - shortVars.length,
                  missing: shortVars.length,
                })}
              </p>

              <ul className="mt-2 space-y-1">
                {shortVars.map((v) => (
                  <li key={v} className="font-mono text-[0.69rem] text-foreground">
                    ·{' '}
                    <span className="font-bold">{t(`curation:routeEngine.var.${v}`)}</span>{' '}
                    {t('curation:routeEngine.shortRoutes', {
                      missing: plan.routes.filter((r) => r.selected && !r.scoredOn.includes(v))
                        .length,
                      total: plan.routes.filter((r) => r.selected).length,
                    })}
                  </li>
                ))}
              </ul>

              <p className="mt-2 max-w-[68ch] text-xs leading-relaxed text-ink-dim">
                {t('curation:routeEngine.shortBody')}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  id="btn-model-recalc"
                  type="button"
                  onClick={() => runPlan(false)}
                  disabled={isPlanning}
                  className="min-h-11 border border-live px-3 text-[0.69rem] font-bold text-live transition-colors hover:bg-live hover:text-background disabled:opacity-40"
                >
                  {t('curation:routeEngine.shortRetry')}
                </button>
                {onAcknowledgeModel && !acknowledged && (
                  <button
                    id="btn-model-ack"
                    type="button"
                    onClick={onAcknowledgeModel}
                    className="min-h-11 border border-rule px-3 text-[0.69rem] font-bold text-ink-dim transition-colors hover:bg-secondary hover:text-ink"
                  >
                    {t('curation:routeEngine.shortAck', { used: 6 - shortVars.length })}
                  </button>
                )}
              </div>
            </div>
          )}

          {acknowledged && modelAck && (
            <p
              id="model-ack-note"
              className="border-b border-rule bg-secondary/40 px-4 py-2.5 font-mono text-[0.69rem] leading-relaxed text-ink-dim"
            >
              {t('curation:routeEngine.ackNote', { stamp: modelAck.split('|')[0] })}
            </p>
          )}

          {/* What the score was actually built from.
              A score is one number and hides its own work. The advertiser is
              being asked to trust that 98.5 means something, and the operator
              is being asked to say so out loud, so the variables are listed
              with their weight and with how many routes carried each one. It
              is also the honest guard: when USPS returns an empty field the
              engine renormalises and scores on what is left, and this is where
              that shows instead of passing for a full model. */}
          {(() => {
            const order = [
              'income',
              'owner_occupied',
              'single_family',
              'vehicles',
              'home_value',
              'household_size',
            ] as const;
            const total = plan.routes.length || 1;
            const covered = (v: string) => plan.routes.filter((r) => r.scoredOn.includes(v)).length;
            const full = order.filter((v) => covered(v) === total).length;

            return (
              <div className="border-b border-rule px-4 py-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="field-label">{t('curation:routeEngine.modelTitle')}</span>
                  <span className="font-mono text-[0.69rem] tabular-nums text-ink-faint">
                    {t('curation:routeEngine.modelCount', { used: full, total: order.length })}
                  </span>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {order.map((v) => {
                    const n = covered(v);
                    const weight = plan.weights[v];
                    const on = n > 0;
                    return (
                      <li
                        key={v}
                        title={t('curation:routeEngine.modelChipTitle', { routes: n, total })}
                        className={`flex items-baseline gap-1.5 border px-2 py-1 text-[0.69rem] ${
                          on
                            ? 'border-clear/40 bg-clear/10 text-clear'
                            : 'border-rule bg-secondary text-ink-faint line-through'
                        }`}
                      >
                        <span className="font-semibold">{t(`curation:routeEngine.var.${v}`)}</span>
                        <span className="font-mono tabular-nums opacity-80">
                          {weight != null
                            ? `${Math.round(weight * 100)}%`
                            : `±${Math.round(plan.householdSizeNudge * 100)}%`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}

          {/* The table scrolls inside its own frame: a ZIP can have forty routes
              and the section around it has to stay the same height. */}
          <div className="max-h-[19rem] overflow-y-auto overflow-x-auto overscroll-contain">
            <table className="w-full min-w-[32rem] text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-rule">
                  <th className="field-label px-3 py-2 text-left">{t('curation:routeEngine.inDrop')}</th>
                  <th className="field-label px-3 py-2 text-left">{t('curation:routeEngine.route')}</th>
                  <th className="field-label px-3 py-2 text-right">
                    {t('curation:routeEngine.households')}
                  </th>
                  <th className="field-label px-3 py-2 text-right">
                    {t('curation:routeEngine.income')}
                  </th>
                  <th className="field-label px-3 py-2 text-right">{t('curation:routeEngine.size')}</th>
                  <th className="field-label px-3 py-2 text-right">{t('curation:routeEngine.score')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.routes.map((r) => (
                  <tr
                    key={r.routeId}
                    className={`border-b border-rule last:border-b-0 ${
                      r.selected ? 'bg-clear/10' : 'opacity-55'
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={r.selected}
                        aria-label={`${t('curation:routeEngine.inDrop')} ${r.crid}`}
                        disabled={busyRoute === r.routeId}
                        onClick={() => toggle(r.routeId, !r.selected)}
                        className={`field-label min-h-11 border px-2.5 transition-colors ${
                          r.selected
                            ? 'border-clear bg-clear/15 text-clear'
                            : 'border-rule text-ink-dim hover:bg-secondary'
                        } disabled:opacity-40`}
                      >
                        {t(r.selected ? 'curation:routeEngine.in' : 'curation:routeEngine.out')}
                      </button>
                    </td>
                    <td className="field-value px-3 py-1.5 text-ink">{r.crid}</td>
                    <td className="field-value px-3 py-1.5 text-right text-ink">
                      {r.residential.toLocaleString('en-US')}
                    </td>
                    <td className="field-value px-3 py-1.5 text-right text-ink-dim">
                      {r.medianIncome ? money(r.medianIncome) : '—'}
                      {r.incomeSource === 'CENSUS_ACS' && (
                        <span
                          className="ml-1 font-mono text-[0.56rem] text-ink-faint"
                          title={t('curation:routeEngine.fromCensus')}
                        >
                          ACS
                        </span>
                      )}
                    </td>
                    <td className="field-value px-3 py-1.5 text-right text-ink-dim">
                      {r.avgHouseholdSize ? r.avgHouseholdSize.toFixed(2) : '—'}
                    </td>
                    <td className="field-value px-3 py-1.5 text-right text-ink">{r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};

const Cell: React.FC<{
  label: string;
  value: string;
  tone?: 'clear';
  id?: string;
}> = ({ label, value, tone, id }) => (
  <div id={id} className="bg-background px-4 py-2.5">
    <dt className="field-label">{label}</dt>
    <dd className={`field-value mt-0.5 text-sm ${tone === 'clear' ? 'text-clear' : 'text-ink'}`}>
      {value}
    </dd>
  </div>
);
