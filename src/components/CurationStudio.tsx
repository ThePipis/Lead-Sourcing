import React, { useState } from 'react';
import { 
  Sparkles, 
  Database, 
  BarChart3, 
  Sliders, 
  Layers, 
  CheckCircle2, 
  ArrowRight, 
  Search, 
  Download,
  AlertTriangle,
  Info,
  MapPin,
  TrendingUp
} from 'lucide-react';
import { CLOSED_CATEGORIES } from '../data/categories.ts';
import { Household, CurationSummary } from '../types.ts';

interface CurationStudioProps {
  campaignCode: string;
  targetCity: string;
  targetZip: string;
  curatedHouseholds: Household[];
  curationSummary: CurationSummary | null;
  isCurating: boolean;
  onRunCuration: () => void;
  onGoToExport: () => void;
}

export const CurationStudio: React.FC<CurationStudioProps> = ({
  campaignCode,
  targetCity,
  targetZip,
  curatedHouseholds,
  curationSummary,
  isCurating,
  onRunCuration,
  onGoToExport,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'matrix' | 'records' | 'routes'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [dataSourceMode, setDataSourceMode] = useState<'MOCK' | 'DATA_AXLE'>('MOCK');

  const filteredHouseholds = curatedHouseholds.filter((h) =>
    h.residentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    h.streetAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
    h.carrierRoute.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Curation Control Panel Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-xs font-mono font-bold text-amber-400">
              MÓDULO C • MOTOR VECTORIAL DE AFINIDAD CONJUNTA
            </span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Algorithmic Audience Curation & Propensity Engine
          </h2>
          <p className="text-xs text-slate-400 max-w-3xl">
            Sustituye los filtros booleanos rígidos de SQL por una matriz de ponderación demográfica multivariable. 
            Calcula la afinidad conjunta acumulada con los 14 comercios y corta exactamente los 5,000 hogares con mayor probabilidad de respuesta.
          </p>
        </div>

        {/* Action button & Data mode toggle */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setDataSourceMode('MOCK')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                dataSourceMode === 'MOCK' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Mock Engine (15k Hogares IE)
            </button>
            <button
              onClick={() => setDataSourceMode('DATA_AXLE')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                dataSourceMode === 'DATA_AXLE' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Data Axle API (Sandbox)
            </button>
          </div>

          <button
            id="btn-run-curation-engine"
            onClick={onRunCuration}
            disabled={isCurating}
            className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 cursor-pointer transition-all"
          >
            {isCurating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                <span>Procesando Matriz 15k...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Ejecutar Curación (5,000)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mathematical Foundation Card */}
      <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-4 font-mono text-xs text-slate-300">
        <div className="flex items-center space-x-2 text-amber-400 font-bold mb-2">
          <Info className="w-4 h-4" />
          <span>FORMULACIÓN MATEMÁTICA DEL MODELO DE PROPENSIDAD:</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/90 p-3 rounded border border-slate-800">
            <span className="text-slate-400 text-[11px]">1. Score de Afinidad Individual Negocio j con Hogar i:</span>
            <p className="text-amber-300 font-bold text-sm my-1">
              Match(i, j) = ∑ [ W_(j, k) × Hogar_(i, k) ]
            </p>
            <p className="text-[10px] text-slate-400">
              Donde W_(j,k) representa el peso asignado al atributo demográfico k para el giro comercial j.
            </p>
          </div>

          <div className="bg-slate-900/90 p-3 rounded border border-slate-800">
            <span className="text-slate-400 text-[11px]">2. Score Compuesto de la Postal H_i & Selección:</span>
            <p className="text-emerald-300 font-bold text-sm my-1">
              H_i = ∑_(j=1)^(14) Match(i, j) &nbsp;|&nbsp; Top 5,000 con max(H_i)
            </p>
            <p className="text-[10px] text-slate-400">
              Garantiza la máxima sinergia cruzada: un hogar debe ser relevante para múltiples comercios simultáneamente.
            </p>
          </div>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            activeTab === 'overview' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          Resumen & Métricas de Curation
        </button>
        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            activeTab === 'matrix' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          Matriz de Ponderación W_(j,k)
        </button>
        <button
          onClick={() => setActiveTab('routes')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            activeTab === 'routes' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          Rutas de Transporte (CRRT)
        </button>
        <button
          onClick={() => setActiveTab('records')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            activeTab === 'records' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          Explorador de Hogares Seleccionados ({curatedHouseholds.length})
        </button>
      </div>

      {/* TAB 1: OVERVIEW & HISTOGRAM */}
      {activeTab === 'overview' && curationSummary && (
        <div className="space-y-6">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-xs text-slate-400">Población Analizada</span>
              <p className="text-2xl font-bold font-mono text-white mt-1">
                {curationSummary.totalAnalyzed.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Hogares unifamiliares en radio 5 mi</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-xs text-slate-400">Hogares Seleccionados (Cut)</span>
              <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                {curationSummary.totalSelected.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Exactamente 5,000 para el tiro postal</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-xs text-slate-400">Score Promedio Seleccionado</span>
              <p className="text-2xl font-bold font-mono text-amber-400 mt-1">
                {curationSummary.avgScore}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Rango: {curationSummary.minScore} a {curationSummary.maxScore} pts
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-xs text-slate-400">Rutas Carrier (CRRT) Activas</span>
              <p className="text-2xl font-bold font-mono text-sky-400 mt-1">
                {curationSummary.carrierRouteDistribution.length}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Para saturación postal con descuento USPS</p>
            </div>
          </div>

          {/* Histogram Chart & Visual Distribution */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  <span>Distribución de Puntajes Compuestos H_i (Histograma de Afinidad)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Frecuencia de hogares agrupados por rango de puntaje. La curva sesgada a la derecha demuestra alta afinidad colectiva.
                </p>
              </div>
            </div>

            {/* Visual Histogram Bars */}
            <div className="pt-4 pb-2">
              <div className="grid grid-cols-8 gap-2 items-end h-44 bg-slate-950 p-4 rounded-lg border border-slate-800">
                {curationSummary.scoreHistogram.map((bin, i) => {
                  const maxCount = Math.max(...curationSummary.scoreHistogram.map((b) => b.count));
                  const heightPercent = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;

                  return (
                    <div key={i} className="flex flex-col items-center h-full justify-end group">
                      <span className="text-[10px] font-mono text-slate-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {bin.count}
                      </span>
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-emerald-600 to-amber-400 transition-all duration-500 hover:brightness-125 cursor-pointer"
                        style={{ height: `${Math.max(8, heightPercent)}%` }}
                        title={`Rango: ${bin.binRange} | Hogares: ${bin.count}`}
                      />
                      <span className="text-[9px] font-mono text-slate-400 mt-2 rotate-[-45deg] origin-top-left truncate max-w-full">
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
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-rose-400 font-bold text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>MÉTODO TRADICIONAL: EDDM ALEATORIO (SPRAY & PRAY)</span>
              </div>
              <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4">
                <li>Bombardea todas las casas de una ruta sin discriminar departamentos, casas alquiladas o desocupadas.</li>
                <li>Hogares sin mascotas reciben ofertas de veterinaria (desperdicio neto de presupuesto).</li>
                <li>Hogares en casas nuevas reciben ofertas de techado de 20 años (tasa de respuesta &lt; 0.4%).</li>
              </ul>
            </div>

            <div className="bg-slate-900 border border-emerald-900/60 p-4 rounded-xl space-y-2 bg-emerald-950/10">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>NUESTRO MOTOR: CURACIÓN ALGORÍTMICA VECTORIAL</span>
              </div>
              <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-4">
                <li>Solo hogares que tienen alta resonancia conjunta con 8 o más de los 14 giros comerciales.</li>
                <li>Concentración probada en familias con alto ingreso disponible, viviendas propias y múltiples vehículos.</li>
                <li>Tasa de respuesta estimada de 2.8% a 4.2% con retorno sobre inversión inmediato.</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={onGoToExport}
              className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center space-x-2 transition-all shadow-md"
            >
              <span>Continuar a Exportación Postal y Códigos QR</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: DEMOGRAPHIC WEIGHTS MATRIX W_{j,k} */}
      {activeTab === 'matrix' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Matriz de Coeficientes de Ponderación W_(j, k) (14 Nichos × 7 Atributos)</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">Escala de Ponderación: 0.00 a 1.00</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead>
                <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                  <th className="py-2.5 px-3 font-bold"># Giro Comercial</th>
                  <th className="py-2.5 px-3 text-right">Ingresos</th>
                  <th className="py-2.5 px-3 text-right">Casa Propia</th>
                  <th className="py-2.5 px-3 text-right">Antigüedad Casa</th>
                  <th className="py-2.5 px-3 text-right">Hijos</th>
                  <th className="py-2.5 px-3 text-right">Vehículos</th>
                  <th className="py-2.5 px-3 text-right">Mascotas</th>
                  <th className="py-2.5 px-3 text-right">Valor Inmueble</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {CLOSED_CATEGORIES.map((cat) => {
                  const w = cat.demographicWeights;
                  return (
                    <tr key={cat.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 px-3 text-white font-medium">
                        <span className="text-amber-400 mr-2">#{cat.id}</span>
                        {cat.name}
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-bold">{w.income.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-sky-400 font-bold">{w.homeOwnership.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-amber-300">{w.homeAgeYears.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-purple-400">{w.childrenPresent.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-cyan-400">{w.vehiclesCount.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-rose-400 font-bold">{w.petOwner.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{w.homeValue.toFixed(2)}</td>
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-amber-400" />
              <span>Distribución por Rutas de Cartero (USPS Carrier Routes - CRRT)</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Total: {curationSummary.totalSelected.toLocaleString()} destinatarios
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {curationSummary.carrierRouteDistribution.map((cr) => (
              <div key={cr.route} className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-amber-400">{cr.route}</span>
                  <p className="text-[11px] text-slate-400">{targetCity}, CA {cr.zip}</p>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold font-mono text-white">{cr.count}</span>
                  <p className="text-[10px] text-slate-500">hogares</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: HOUSEHOLDS EXPLORER */}
      {activeTab === 'records' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, calle o ruta (ej: Citrus, C012)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <span className="text-xs text-slate-400 font-mono self-center">
              Mostrando {filteredHouseholds.length} de {curatedHouseholds.length} hogares
            </span>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead className="sticky top-0 bg-slate-950 z-10 border-b border-slate-800 text-slate-300">
                <tr>
                  <th className="py-2.5 px-3">ID Hogar</th>
                  <th className="py-2.5 px-3">Destinatario</th>
                  <th className="py-2.5 px-3">Dirección Residencial</th>
                  <th className="py-2.5 px-3">Ruta CRRT</th>
                  <th className="py-2.5 px-3 text-right">Secuencia</th>
                  <th className="py-2.5 px-3 text-right">Score H_i</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredHouseholds.slice(0, 100).map((h) => (
                  <tr key={h.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-2 px-3 text-amber-400 font-bold">{h.id}</td>
                    <td className="py-2 px-3 text-white font-medium">{h.residentName}</td>
                    <td className="py-2 px-3 text-slate-400">{h.streetAddress}, {h.city} {h.zip5}</td>
                    <td className="py-2 px-3 text-sky-400 font-bold">{h.carrierRoute}</td>
                    <td className="py-2 px-3 text-right text-slate-400">{h.walkSequence}</td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">{h.compositeScore}</td>
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
