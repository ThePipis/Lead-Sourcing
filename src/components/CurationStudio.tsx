import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RouteEngine } from './RouteEngine.tsx';
import {
  Sparkles,
  BarChart3,
  Sliders,
  CheckCircle2,
  ArrowRight,
  Search,
  AlertTriangle,
  Info,
  MapPin,
} from 'lucide-react';
import { CLOSED_CATEGORIES } from '../data/categories.ts';
import { Household, CurationSummary } from '../types.ts';

interface CurationStudioProps {
  campaignCode: string;
  /** Needed by the route engine, which stores its plan against the campaign. */
  campaignId: string;
  targetHouseholds: number;
  /** Reports the routes' covered household count up to the ledger and the card. */
  onCoverageChange: (covered: number, routeCount: number) => void;
  targetCity: string;
  targetZip: string;
  curatedHouseholds: Household[];
  curationSummary: CurationSummary | null;
  isCurating: boolean;
  onRunCuration: () => void;
  onGoToExport: () => void;
  /** Households already persisted for this campaign, independent of this session. */
  persistedCount?: number;
  /** Follows the app's world: a synthetic pool in the practice file. */
  mockMode: boolean;
}

export const CurationStudio: React.FC<CurationStudioProps> = ({
  campaignId,
  targetZip,
  targetHouseholds,
  onCoverageChange,
  targetCity,
  curatedHouseholds,
  curationSummary,
  isCurating,
  onRunCuration,
  onGoToExport,
  persistedCount = 0,
  mockMode,
}) => {
  const { t } = useTranslation(['curation', 'common']);
  const [activeTab, setActiveTab] = useState<'overview' | 'matrix' | 'records' | 'routes'>(
    'overview',
  );
  const [searchTerm, setSearchTerm] = useState('');

  const filteredHouseholds = curatedHouseholds.filter(
    (h) =>
      h.residentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.streetAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.carrierRoute.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* The audience is decided here, in carrier routes. Everything below —
          the propensity engine's synthetic pool, the household table — describes
          a drop whose real size this panel sets. */}
      <RouteEngine
        campaignId={campaignId}
        targetZip={targetZip}
        targetHouseholds={targetHouseholds}
        onCoverageChange={onCoverageChange}
      />

      {/* Curation Control Panel Header */}
      <div className="flex flex-col gap-4 border border-border bg-card p-5 text-card-foreground transition-colors lg:flex-row lg:items-center">
        <p className="min-w-0 sm:min-w-[34ch] max-w-[68ch] flex-1 text-xs leading-relaxed text-muted-foreground">
          {t('curation:header.description')}
        </p>

        {/* The data source follows the app's world, set once in the drawer. */}
        <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:w-auto">
          <button
            id="btn-run-curation-engine"
            onClick={() => onRunCuration()}
            disabled={isCurating}
            className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider bg-clear hover:opacity-90 text-background  flex items-center justify-center space-x-2 cursor-pointer transition-colors disabled:opacity-50"
          >
            {isCurating ? (
              <>
                <div className="w-3.5 h-3.5 border border-white border-t-transparent  animate-spin"></div>
                <span>{t('curation:header.processing')}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{t('curation:header.runCuration')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mathematical Foundation Card */}
      <div className="bg-secondary/40 border border-border p-4 font-mono text-xs text-foreground  transition-colors">
        <div className="flex items-center space-x-2 text-primary font-bold mb-2">
          <Info className="w-4 h-4" />
          <span>{t('curation:math.title')}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card p-3 border border-border ">
            <span className="text-muted-foreground text-[0.69rem]">
              {t('curation:math.individualScore')}
            </span>
            <p className="text-primary font-bold text-sm my-1">
              {t('curation:math.individualFormula')}
            </p>
            <p className="text-[0.63rem] text-muted-foreground">
              {t('curation:math.individualNote')}
            </p>
          </div>

          <div className="bg-card p-3 border border-border ">
            <span className="text-muted-foreground text-[0.69rem]">
              {t('curation:math.compositeScore')}
            </span>
            <p className="text-clear font-bold text-sm my-1">
              {t('curation:math.compositeFormula')}
            </p>
            <p className="text-[0.63rem] text-muted-foreground">
              {t('curation:math.compositeNote')}
            </p>
          </div>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex space-x-2 border-b border-border pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-xs font-bold transition-colors cursor-pointer shrink-0 ${
            activeTab === 'overview'
              ? 'bg-primary text-primary-foreground '
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {t('curation:tabs.overview')}
        </button>
        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-4 py-2 text-xs font-bold transition-colors cursor-pointer shrink-0 ${
            activeTab === 'matrix'
              ? 'bg-primary text-primary-foreground '
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {t('curation:tabs.matrix')}
        </button>
        <button
          onClick={() => setActiveTab('routes')}
          className={`px-4 py-2 text-xs font-bold transition-colors cursor-pointer shrink-0 ${
            activeTab === 'routes'
              ? 'bg-primary text-primary-foreground '
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {t('curation:tabs.routes')}
        </button>
        <button
          onClick={() => setActiveTab('records')}
          className={`px-4 py-2 text-xs font-bold transition-colors cursor-pointer shrink-0 ${
            activeTab === 'records'
              ? 'bg-primary text-primary-foreground '
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {t('curation:tabs.records', { count: curatedHouseholds.length })}
        </button>
      </div>

      {/* Nothing to show until the engine has run at least once */}
      {!curationSummary && (activeTab === 'overview' || activeTab === 'routes') && (
        <div className="bg-card border border-border p-10 text-center space-y-3 text-card-foreground ">
          <Sparkles className="w-6 h-6 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold text-foreground">
            {persistedCount > 0
              ? t('curation:empty.persistedTitle', {
                  count: persistedCount.toLocaleString('en-US'),
                })
              : t('curation:empty.title')}
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {persistedCount > 0
              ? t('curation:empty.persistedDescription')
              : t('curation:empty.description')}
          </p>
          <button
            id="btn-run-curation-empty"
            type="button"
            onClick={() => onRunCuration()}
            disabled={isCurating}
            className="mt-2 inline-flex items-center gap-1.5 bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {isCurating ? t('curation:header.processing') : t('curation:header.runCuration')}
            </span>
          </button>
        </div>
      )}

      {/* TAB 1: OVERVIEW & HISTOGRAM */}
      {activeTab === 'overview' && curationSummary && (
        <div className="space-y-6">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border p-4 text-card-foreground ">
              <span className="text-xs text-muted-foreground">
                {t('curation:stats.totalAnalyzed')}
              </span>
              <p className="text-2xl font-bold font-mono text-foreground mt-1">
                {curationSummary.totalAnalyzed.toLocaleString()}
              </p>
              <p className="text-[0.69rem] text-muted-foreground mt-1">
                {t('curation:stats.totalAnalyzedSub')}
              </p>
            </div>

            <div className="bg-card border border-border p-4 text-card-foreground ">
              <span className="text-xs text-muted-foreground">
                {t('curation:stats.totalSelected')}
              </span>
              <p className="text-2xl font-bold font-mono text-clear mt-1">
                {curationSummary.totalSelected.toLocaleString()}
              </p>
              <p className="text-[0.69rem] text-muted-foreground mt-1">
                {t('curation:stats.totalSelectedSub')}
              </p>
            </div>

            <div className="bg-card border border-border p-4 text-card-foreground ">
              <span className="text-xs text-muted-foreground">{t('curation:stats.avgScore')}</span>
              <p className="text-2xl font-bold font-mono text-live mt-1">
                {curationSummary.avgScore}
              </p>
              <p className="text-[0.69rem] text-muted-foreground mt-1">
                {t('curation:stats.avgScoreRange', {
                  min: curationSummary.minScore,
                  max: curationSummary.maxScore,
                })}
              </p>
            </div>

            <div className="bg-card border border-border p-4 text-card-foreground ">
              <span className="text-xs text-muted-foreground">
                {t('curation:stats.carrierRoutes')}
              </span>
              <p className="text-2xl font-bold font-mono text-primary mt-1">
                {curationSummary.carrierRouteDistribution.length}
              </p>
              <p className="text-[0.69rem] text-muted-foreground mt-1">
                {t('curation:stats.carrierRoutesSub')}
              </p>
            </div>
          </div>

          {/* Histogram Chart & Visual Distribution */}
          <div className="bg-card border border-border p-5 space-y-4 text-card-foreground ">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span>{t('curation:stats.histogramTitle')}</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('curation:stats.histogramSub')}
                </p>
              </div>
            </div>

            {/* Visual Histogram Bars */}
            <div className="pt-4 pb-2">
              <div className="grid grid-cols-8 gap-2 items-end h-44 bg-secondary/50 p-4 border border-border">
                {curationSummary.scoreHistogram.map((bin, i) => {
                  const maxCount = Math.max(...curationSummary.scoreHistogram.map((b) => b.count));
                  const heightPercent = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;

                  return (
                    <div key={i} className="flex flex-col items-center h-full justify-end group">
                      <span className="text-[0.63rem] font-mono text-muted-foreground mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {bin.count}
                      </span>
                      <div
                        className="w-full bg-live transition-colors duration-500 hover:brightness-110 "
                        style={{ height: `${Math.max(8, heightPercent)}%` }}
                        title={t('curation:stats.histogramBarTitle', {
                          range: bin.binRange,
                          count: bin.count,
                        })}
                      />
                      <span className="text-[0.56rem] font-mono text-muted-foreground mt-2 rotate-[-45deg] origin-top-left truncate max-w-full">
                        {bin.binRange}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Comparison: Random EDDM vs Algorithmic Propensity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border p-4 space-y-2 text-card-foreground ">
              <div className="flex items-center space-x-2 text-due font-bold text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>{t('curation:comparison.eddmTitle')}</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4 leading-relaxed">
                <li>{t('curation:comparison.eddm1')}</li>
                <li>{t('curation:comparison.eddm2')}</li>
                <li>{t('curation:comparison.eddm3')}</li>
              </ul>
            </div>

            <div className="bg-clear/10 border border-clear/40 p-4 space-y-2 text-card-foreground ">
              <div className="flex items-center space-x-2 text-clear font-bold text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('curation:comparison.curationTitle')}</span>
              </div>
              <ul className="text-xs text-foreground space-y-1.5 list-disc pl-4 leading-relaxed">
                <li>{t('curation:comparison.curation1')}</li>
                <li>{t('curation:comparison.curation2')}</li>
                <li>{t('curation:comparison.curation3')}</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={onGoToExport}
              className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider bg-primary hover:bg-primary/90 text-primary-foreground flex items-center space-x-2 transition-colors  cursor-pointer"
            >
              <span>{t('curation:comparison.continueExport')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: DEMOGRAPHIC WEIGHTS MATRIX W_{j,k} */}
      {activeTab === 'matrix' && (
        <div className="bg-card border border-border overflow-hidden p-4 space-y-3 text-card-foreground ">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-primary" />
              <span>{t('curation:matrix.title')}</span>
            </h3>
            <span className="text-xs text-muted-foreground font-mono">
              {t('curation:matrix.scale')}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead>
                <tr className="bg-secondary text-secondary-foreground border-b border-border">
                  <th className="py-2.5 px-3 font-bold">{t('curation:matrix.colCategory')}</th>
                  <th className="py-2.5 px-3 text-right">{t('curation:matrix.colIncome')}</th>
                  <th className="py-2.5 px-3 text-right">
                    {t('curation:matrix.colHomeOwnership')}
                  </th>
                  <th className="py-2.5 px-3 text-right">{t('curation:matrix.colHomeAge')}</th>
                  <th className="py-2.5 px-3 text-right">{t('curation:matrix.colChildren')}</th>
                  <th className="py-2.5 px-3 text-right">{t('curation:matrix.colVehicles')}</th>
                  <th className="py-2.5 px-3 text-right">{t('curation:matrix.colPets')}</th>
                  <th className="py-2.5 px-3 text-right">{t('curation:matrix.colHomeValue')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {CLOSED_CATEGORIES.map((cat) => {
                  const w = cat.demographicWeights;
                  const catName = t(`common:categories.${cat.id}.name`, cat.name);
                  return (
                    <tr key={cat.id} className="hover:bg-muted/50 transition-colors">
                      <td className="py-2 px-3 text-foreground font-medium">
                        <span className="text-primary mr-2 font-bold">#{cat.id}</span>
                        {catName}
                      </td>
                      <td className="py-2 px-3 text-right text-clear font-bold">
                        {w.income.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-ink font-bold">
                        {w.homeOwnership.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-live">
                        {w.homeAgeYears.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-ink ">
                        {w.childrenPresent.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-ink ">
                        {w.vehiclesCount.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-due font-bold">
                        {w.petOwner.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        {w.homeValue.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CARRIER ROUTES BREAKDOWN */}
      {activeTab === 'routes' && curationSummary && (
        <div className="bg-card border border-border p-5 space-y-4 text-card-foreground ">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-primary" />
              <span>{t('curation:routes.title')}</span>
            </h3>
            <span className="text-xs text-muted-foreground font-mono">
              {t('curation:routes.total', {
                count: curationSummary.totalSelected.toLocaleString(),
              })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {curationSummary.carrierRouteDistribution.map((cr) => (
              <div
                key={cr.route}
                className="bg-secondary/50 p-3.5 border border-border flex items-center justify-between "
              >
                <div>
                  <span className="text-xs font-mono font-bold text-primary">{cr.route}</span>
                  <p className="text-[0.69rem] text-muted-foreground">
                    {targetCity}, CA {cr.zip}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold font-mono text-foreground">{cr.count}</span>
                  <p className="text-[0.63rem] text-muted-foreground">
                    {t('curation:routes.households')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: HOUSEHOLDS EXPLORER */}
      {activeTab === 'records' && (
        <div className="bg-card border border-border overflow-hidden p-4 space-y-3 text-card-foreground ">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('curation:records.searchPlaceholder')}
                className="w-full bg-background border border-border pl-9 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary "
              />
            </div>
            <span className="text-xs text-muted-foreground font-mono self-center">
              {t('curation:records.showing', {
                filtered: filteredHouseholds.length,
                total: curatedHouseholds.length,
              })}
            </span>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead className="sticky top-0 bg-secondary text-secondary-foreground z-10 border-b border-border">
                <tr>
                  <th className="py-2.5 px-3">{t('curation:records.colId')}</th>
                  <th className="py-2.5 px-3">{t('curation:records.colRecipient')}</th>
                  <th className="py-2.5 px-3">{t('curation:records.colAddress')}</th>
                  <th className="py-2.5 px-3">{t('curation:records.colCrrt')}</th>
                  <th className="py-2.5 px-3 text-right">{t('curation:records.colSequence')}</th>
                  <th className="py-2.5 px-3 text-right">{t('curation:records.colScore')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {filteredHouseholds.slice(0, 100).map((h) => (
                  <tr key={h.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-2 px-3 text-primary font-bold">{h.id}</td>
                    <td className="py-2 px-3 text-foreground font-medium">{h.residentName}</td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {h.streetAddress}, {h.city} {h.zip5}
                    </td>
                    <td className="py-2 px-3 text-ink font-bold">{h.carrierRoute}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{h.walkSequence}</td>
                    <td className="py-2 px-3 text-right text-clear font-bold">
                      {h.compositeScore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
