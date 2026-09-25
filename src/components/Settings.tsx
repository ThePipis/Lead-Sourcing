import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PlugZap,
  Printer,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { AppMode } from '../hooks/useAppMode.ts';
import {
  DataSource,
  SourceTest,
  listDataSources,
  setDataSourceEnabled,
  testDataSource,
} from '../services/settingsService.ts';
import {
  CostSettings,
  CostSettingsDraft,
  DIRECT_MAIL_PARTNERS,
  DirectMailPartner,
  getCosts,
  updateCosts,
} from '../services/costService.ts';

interface SettingsProps {
  open: boolean;
  mode: AppMode;
  /** Reach the costs are computed at. */
  households: number;
  onClose: () => void;
  /** Called after costs change so the open campaign re-reads its costs. */
  onCostsChanged?: () => void;
  onCostsChange?: (unitCost: number, fixedCost: number) => void;
}

type Tab = 'SOURCES' | 'PRINT';

const SETTLE_MS = 500;

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Panel de Configuración del Sistema (Fuentes de Datos e Imprenta & Costos Direct Mail).
 *
 * Reúne en un único cajón lateral de configuración:
 * 1. Fuentes de datos activas y pruebas de conexión de API.
 * 2. Gestor integral de imprentas y costos de correo directo del Inland Empire (All-Inclusive).
 */
export const Settings: React.FC<SettingsProps> = ({
  open,
  mode,
  households,
  onClose,
  onCostsChanged,
  onCostsChange,
}) => {
  const { t } = useTranslation(['common']);
  const [tab, setTab] = useState<Tab>('PRINT');
  const [sources, setSources] = useState<DataSource[]>([]);
  const [tests, setTests] = useState<Record<string, SourceTest>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ------------------------------------------------------------- Imprenta & Costos Direct Mail
  const [costs, setCosts] = useState<CostSettings | null>(null);
  const [costsWriting, setCostsWriting] = useState(false);
  const [costsError, setCostsError] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('zoom_mailing');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const costsTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    listDataSources(mode)
      .then(setSources)
      .catch((e) => setError(String(e)));

    getCosts(mode, households)
      .then((next) => {
        setCosts(next);
        onCostsChange?.(next.unitCost, next.fixedCost);

        const matched = DIRECT_MAIL_PARTNERS.find(
          (p) => Math.abs(p.costPerPiece - next.unitCost) < 0.005,
        );
        if (matched) {
          setSelectedPartnerId(matched.id);
        } else {
          setSelectedPartnerId('custom');
        }
      })
      .catch((e) => setCostsError(String(e)));
  }, [open, mode, households, onCostsChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const toggleSource = async (source: DataSource) => {
    try {
      const next = await setDataSourceEnabled(mode, source.id, !source.enabled);
      setSources((prev) => prev.map((s) => (s.id === next.id ? next : s)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runTestSource = async (source: DataSource) => {
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

  const saveCostsPatch = (patch: Partial<CostSettingsDraft>) => {
    window.clearTimeout(costsTimer.current);
    costsTimer.current = window.setTimeout(async () => {
      setCostsWriting(true);
      try {
        const next = await updateCosts(mode, households, patch);
        setCosts(next);
        onCostsChange?.(next.unitCost, next.fixedCost);
        onCostsChanged?.();
        setCostsError(null);
      } catch (err) {
        setCostsError(err instanceof Error ? err.message : String(err));
      } finally {
        setCostsWriting(false);
      }
    }, SETTLE_MS);
  };

  const handleSelectPartner = (partner: DirectMailPartner) => {
    setSelectedPartnerId(partner.id);
    const postage = 0.247;
    const print = Math.max(0, Number((partner.costPerPiece - postage).toFixed(4)));

    const patch: Partial<CostSettingsDraft> = {
      postagePerPiece: postage,
      printPerPiece: print,
      listPerPiece: 0,
      variableDataPerPiece: 0,
      presortPerPiece: 0,
      finishingPerPiece: 0,
      setupFee: 0,
      deliveryFee: 0,
      sourceNote: `${partner.name} (${partner.location}) · ${partner.note}`,
    };

    setCosts((prev) =>
      prev
        ? {
            ...prev,
            ...patch,
            unitCost: partner.costPerPiece,
            fixedCost: 0,
            previewTotalCost: partner.costPerPiece * households,
          }
        : prev,
    );

    saveCostsPatch(patch);
  };

  const handleCustomUnitCost = (raw: string) => {
    const val = Number(raw);
    if (!Number.isFinite(val) || val <= 0) return;
    setSelectedPartnerId('custom');

    const postage = 0.247;
    const print = Math.max(0, Number((val - postage).toFixed(4)));

    const patch: Partial<CostSettingsDraft> = {
      postagePerPiece: postage,
      printPerPiece: print,
      sourceNote: `Cotización directa personalizada: $${val.toFixed(4)} por flyer todo incluido.`,
    };

    setCosts((prev) =>
      prev
        ? {
            ...prev,
            ...patch,
            unitCost: val,
            previewTotalCost: val * households + (prev.fixedCost || 0),
          }
        : prev,
    );

    saveCostsPatch(patch);
  };

  if (!open) return null;

  const currentUnitCost = costs?.unitCost ?? 0.615;
  const currentTotalCost =
    costs?.previewTotalCost ?? (currentUnitCost * households + (costs?.fixedCost || 0));
  const currentPartner =
    DIRECT_MAIL_PARTNERS.find((p) => p.id === selectedPartnerId) || DIRECT_MAIL_PARTNERS[0];

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
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl md:max-w-2xl flex-col border-l border-rule-strong bg-background shadow-2xl transition-all"
      >
        {/* Cabecera del Cajón */}
        <header className="border-b border-rule-strong px-5 py-3.5 bg-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="imperative text-sm font-bold text-ink tracking-wide">
                {t('common:settings.title')}
              </h2>
              <p className="mt-0.5 font-mono text-[0.65rem] text-ink-dim">
                {t(mode === 'LIVE' ? 'common:settings.scopeLive' : 'common:settings.scopeDemo')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common:settings.close')}
              className="flex min-h-10 min-w-10 items-center justify-center text-ink-dim transition-colors hover:bg-secondary hover:text-ink cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Selector de Pestañas */}
          <div role="tablist" className="mt-3 flex gap-1 border-t border-rule/60 pt-2.5">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'PRINT'}
              onClick={() => setTab('PRINT')}
              className={`field-label flex min-h-9 items-center gap-1.5 px-3 text-xs font-bold transition-all cursor-pointer ${
                tab === 'PRINT'
                  ? 'border-b-2 border-live bg-secondary text-ink shadow-xs'
                  : 'text-ink-dim hover:bg-secondary/60 hover:text-ink'
              }`}
            >
              <Printer className="h-3.5 w-3.5 text-live" />
              {t('common:settings.tab.print', 'Imprenta y costos direct mail')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'SOURCES'}
              onClick={() => setTab('SOURCES')}
              className={`field-label flex min-h-9 items-center gap-1.5 px-3 text-xs font-bold transition-all cursor-pointer ${
                tab === 'SOURCES'
                  ? 'border-b-2 border-live bg-secondary text-ink shadow-xs'
                  : 'text-ink-dim hover:bg-secondary/60 hover:text-ink'
              }`}
            >
              <PlugZap className="h-3.5 w-3.5" />
              {t('common:settings.tab.sources', 'Fuentes de datos')}
            </button>
          </div>
        </header>

        {/* Contenido con Scroll Propio */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
          {error && (
            <p className="border border-due/50 bg-due/10 px-3 py-2 text-xs text-due">{error}</p>
          )}

          {tab === 'SOURCES' ? (
            /* ----------------- PESTAÑA 1: FUENTES DE DATOS ----------------- */
            <>
              <p className="text-xs leading-relaxed text-ink-dim">
                {t('common:settings.sourcesIntro')}
              </p>

              <ul className="mt-3 space-y-3">
                {sources.map((s) => {
                  const result = tests[s.id];
                  return (
                    <li key={s.id} className="border border-rule bg-card">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-rule px-3.5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="field-value text-sm font-bold text-ink">{s.name}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span
                              className={`field-label text-[0.65rem] font-bold ${
                                s.cost === 'FREE' ? 'text-clear' : 'text-live'
                              }`}
                            >
                              {t(`common:settings.cost.${s.cost.toLowerCase()}`)}
                            </span>
                            {s.envKey && (
                              <span
                                className={`field-label text-[0.65rem] ${
                                  s.configured ? 'text-clear' : 'text-due'
                                }`}
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
                          onClick={() => toggleSource(s)}
                          className={`field-label min-h-9 shrink-0 border px-3 text-xs font-bold transition-colors cursor-pointer ${
                            s.enabled
                              ? 'border-clear bg-clear/15 text-clear'
                              : 'border-rule text-ink-dim hover:bg-secondary'
                          }`}
                        >
                          {t(s.enabled ? 'common:settings.on' : 'common:settings.off')}
                        </button>
                      </div>

                      <div className="space-y-1.5 px-3.5 py-2.5">
                        <p className="text-xs leading-relaxed text-ink">
                          <span className="field-label mr-1.5 font-bold text-clear">
                            {t('common:settings.gives')}
                          </span>
                          {s.gives}
                        </p>
                        <p className="text-xs leading-relaxed text-ink-dim">
                          <span className="field-label mr-1.5 font-bold text-due">
                            {t('common:settings.lacks')}
                          </span>
                          {s.lacks}
                        </p>
                        <p className="text-[0.69rem] leading-relaxed text-ink-faint">{s.note}</p>

                        <div className="flex flex-wrap items-center gap-3 pt-1.5">
                          <button
                            type="button"
                            onClick={() => runTestSource(s)}
                            disabled={testing === s.id}
                            className="field-label flex min-h-9 items-center gap-1.5 border border-rule px-3 text-xs font-medium text-ink-dim transition-colors hover:bg-secondary hover:text-ink disabled:opacity-40 cursor-pointer"
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
                              className="field-label flex min-h-9 items-center gap-1.5 text-xs text-live transition-colors hover:text-ink"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {t('common:settings.openSite')}
                            </a>
                          )}
                        </div>

                        {result && (
                          <div
                            className={`mt-1.5 border px-2.5 py-2 text-xs leading-relaxed ${
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
            /* ----------------- PESTAÑA 2: IMPRENTA Y COSTOS DIRECT MAIL ----------------- */
            <div data-tour="costs" className="space-y-5">
              {costsError && (
                <p className="border border-due/40 bg-due/10 px-3 py-2 text-xs text-due">
                  {costsError}
                </p>
              )}

              {/* Banner Informativo All-Inclusive */}
              <div className="rounded-md border border-rule/70 bg-secondary/40 p-3.5">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-live" aria-hidden="true" />
                  <div className="text-xs leading-relaxed text-ink-dim">
                    <span className="font-bold text-ink">Cotización All-Inclusive:</span> En lugar de
                    desglosar preprensa, papel, fajado e inyección de tinta por separado, seleccionas
                    tu socio de Direct Mail local del Inland Empire con la tarifa consolidada
                    (impresión Jumbo 12"×9" + franqueo EDDM del USPS incluido).
                  </div>
                </div>
              </div>

              {/* 1. Selector de Socio Direct Mail */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="field-label text-xs font-bold uppercase tracking-wider text-ink">
                    1. Selecciona tu Socio de Direct Mail (Inland Empire)
                  </label>
                  <span className="font-mono text-[0.68rem] text-live font-bold">
                    {currentPartner.name}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {DIRECT_MAIL_PARTNERS.map((partner) => {
                    const isSelected = selectedPartnerId === partner.id;
                    return (
                      <button
                        key={partner.id}
                        type="button"
                        onClick={() => handleSelectPartner(partner)}
                        className={`flex flex-col justify-between p-3 text-left border transition-all cursor-pointer relative min-h-[5.5rem] ${
                          isSelected
                            ? 'border-live bg-live/10 ring-1 ring-live shadow-xs'
                            : 'border-rule bg-card hover:bg-secondary/70 hover:border-ink/50'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1.5 mb-0.5">
                            <span className="font-bold text-xs text-ink truncate">
                              {partner.name}
                            </span>
                            {isSelected && (
                              <Check
                                className="h-3.5 w-3.5 text-live shrink-0"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <p className="text-[0.68rem] text-ink-dim truncate">{partner.location}</p>
                        </div>

                        <div className="mt-2 flex items-baseline justify-between pt-1 border-t border-rule/50">
                          <span className="font-mono text-sm font-black text-live">
                            ${partner.costPerPiece.toFixed(3)}
                            <span className="text-[0.65rem] font-normal text-ink-dim"> / flyer</span>
                          </span>
                          <span className="text-[0.62rem] text-ink-faint truncate max-w-[50%]">
                            {partner.id === 'custom' ? 'Directo' : 'All-in'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Tarifa Unitaria Activa y Proyección de la Tirada */}
              <div className="border-t border-rule pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Columna 1: Tarifa unitaria editable */}
                  <div>
                    <label
                      htmlFor="settings-cost-per-piece-input"
                      className="block text-xs font-bold text-ink mb-1.5 uppercase tracking-wider"
                    >
                      2. Costo por Flyer Todo Incluido ($)
                    </label>
                    <div className="relative">
                      <span
                        className="absolute left-3 top-2 text-xs font-mono text-ink-dim select-none"
                        aria-hidden="true"
                      >
                        $
                      </span>
                      <input
                        id="settings-cost-per-piece-input"
                        type="number"
                        step="0.005"
                        min="0.10"
                        max="3.00"
                        value={Number(currentUnitCost.toFixed(4))}
                        onChange={(e) => handleCustomUnitCost(e.target.value)}
                        className="w-full pl-7 pr-3 py-1.5 border border-rule bg-card font-mono text-sm font-bold text-ink focus-visible:ring-1 focus-visible:ring-live focus:outline-none transition-colors"
                      />
                    </div>
                    <span className="text-[0.66rem] text-ink-dim mt-1.5 block leading-tight">
                      Papel 14pt + Full Color + Franqueo USPS EDDM Retail ($0.247)
                    </span>
                  </div>

                  {/* Columna 2: Proyección de la Tirada Activa */}
                  <div className="border border-rule bg-secondary/30 p-3 flex flex-col justify-between">
                    <div>
                      <span className="field-label text-[0.65rem] uppercase font-bold text-ink-dim block">
                        Inversión Proyectada
                      </span>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-xl font-black font-mono text-live">
                          {money(currentTotalCost)}
                        </span>
                        <span className="text-xs font-mono font-medium text-ink-dim">
                          {households.toLocaleString('en-US')} hogares
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 pt-1 border-t border-rule/50 flex items-center justify-between text-[0.65rem]">
                      <span className="text-ink-faint">Estado de sincronización</span>
                      {costsWriting ? (
                        <span className="text-live font-bold flex items-center gap-1 animate-pulse font-mono">
                          <Sparkles className="h-3 w-3" /> Guardando…
                        </span>
                      ) : (
                        <span className="text-clear font-medium font-mono">Actualizado</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Desglose Técnico Postal Opcional y Botón de Aplicación */}
              <div className="border-t border-rule pt-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="field-label text-xs text-ink-dim hover:text-ink underline flex items-center gap-1 cursor-pointer"
                  >
                    {showAdvanced
                      ? 'Ocultar desglose técnico postal'
                      : 'Ver desglose técnico postal detallado'}
                  </button>

                  <span className="font-mono text-[0.65rem] text-ink-dim">
                    USPS EDDM Retail 2026
                  </span>
                </div>

                {/* Desglose desplegable */}
                {showAdvanced && (
                  <div className="border border-rule bg-card p-3 text-xs space-y-2 animate-fadeIn">
                    <p className="font-bold text-ink mb-1.5">
                      Desglose de Producción y Enrutamiento Postal:
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-ink-dim font-mono text-[0.72rem]">
                      <div className="border-b border-rule/40 pb-1">
                        <span className="text-ink-faint block text-[0.62rem] font-sans">
                          Franqueo USPS EDDM:
                        </span>
                        ${costs?.postagePerPiece.toFixed(3) ?? '0.247'} / pieza
                      </div>
                      <div className="border-b border-rule/40 pb-1">
                        <span className="text-ink-faint block text-[0.62rem] font-sans">
                          Impresión Offset Jumbo:
                        </span>
                        ${costs?.printPerPiece.toFixed(3) ?? '0.368'} / pieza
                      </div>
                      <div className="border-b border-rule/40 pb-1">
                        <span className="text-ink-faint block text-[0.62rem] font-sans">
                          Higiene CASS/NCOA:
                        </span>
                        ${costs?.listPerPiece.toFixed(3) ?? '0.000'} (Incluido)
                      </div>
                      <div className="border-b border-rule/40 pb-1">
                        <span className="text-ink-faint block text-[0.62rem] font-sans">
                          Cargos de Setup:
                        </span>
                        ${costs?.setupFee ?? '0.00'} (Sin costo)
                      </div>
                      <div className="border-b border-rule/40 pb-1">
                        <span className="text-ink-faint block text-[0.62rem] font-sans">
                          Entrega BMEU/SCF:
                        </span>
                        ${costs?.deliveryFee ?? '0.00'} (Sin costo)
                      </div>
                      <div className="border-b border-rule/40 pb-1">
                        <span className="text-ink-faint block text-[0.62rem] font-sans">
                          Proveedor seleccionado:
                        </span>
                        <span className="truncate block font-sans text-ink">
                          {currentPartner.name}
                        </span>
                      </div>
                    </div>
                    <p className="text-[0.66rem] text-ink-faint pt-1 leading-normal font-sans">
                      Nota: {costs?.sourceNote || currentPartner.note}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
