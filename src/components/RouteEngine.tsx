import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, Radar } from 'lucide-react';
import {
  RoutePlan,
  campaignRouteManifestUrl,
  getCampaignRoutes,
  planCampaignRoutes,
  toggleCampaignRoute,
} from '../services/routeService.ts';

interface RouteEngineProps {
  campaignId: string;
  targetZip: string;
  targetHouseholds: number;
  /** Reports the covered count upward so the ledger and the card follow it. */
  onCoverageChange: (covered: number, routeCount: number) => void;
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
}) => {
  const { t } = useTranslation(['curation', 'common']);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [zip, setZip] = useState(targetZip);
  const [target, setTarget] = useState(String(targetHouseholds));
  const [isPlanning, setIsPlanning] = useState(false);
  const [busyRoute, setBusyRoute] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Whatever was planned before is the campaign's audience until it is replanned.
  useEffect(() => {
    let alive = true;
    getCampaignRoutes(campaignId)
      .then((p) => {
        if (!alive || p.routes.length === 0) return;
        setPlan(p);
        onCoverageChange(p.covered, p.selectedRoutes);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [campaignId]);

  const runPlan = async () => {
    const wanted = Number(target);
    if (!/^\d{5}$/.test(zip) || !Number.isFinite(wanted) || wanted < 100) return;
    setIsPlanning(true);
    setError(null);
    try {
      const next = await planCampaignRoutes(campaignId, zip, wanted);
      setPlan(next);
      onCoverageChange(next.covered, next.selectedRoutes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsPlanning(false);
    }
  };

  const toggle = async (routeId: string, selected: boolean) => {
    setBusyRoute(routeId);
    try {
      const next = await toggleCampaignRoute(campaignId, routeId, selected);
      setPlan((prev) => (prev ? { ...next, target: prev.target, zipCode: prev.zipCode } : next));
      onCoverageChange(next.covered, next.selectedRoutes);
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
              onChange={(e) => setZip(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
              className="field-value w-28 border border-rule bg-card px-3 py-2 text-sm text-ink"
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
              onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              className="field-value w-32 border border-rule bg-card px-3 py-2 text-sm text-ink"
            />
          </div>
          <button
            id="btn-plan-routes"
            type="button"
            onClick={runPlan}
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

          {plan && plan.selectedRoutes > 0 && (
            <a
              id="btn-download-route-manifest"
              href={campaignRouteManifestUrl(campaignId)}
              className="field-label flex min-h-11 items-center gap-1.5 border border-rule px-3 text-ink-dim transition-colors hover:bg-secondary hover:text-ink"
            >
              <Download className="h-3.5 w-3.5" />
              {t('curation:routeEngine.manifest')}
            </a>
          )}
        </div>

        {error && (
          <p className="mt-3 border border-due/50 bg-due/10 px-3 py-2 text-xs text-due">{error}</p>
        )}
      </div>

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
                    </td>
                    <td className="field-value px-3 py-1.5 text-right text-ink-dim">
                      {r.avgHouseholdSize || '—'}
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
