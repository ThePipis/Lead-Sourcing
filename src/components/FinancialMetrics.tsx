import React from 'react';
import { DollarSign, TrendingUp, AlertCircle, CheckCircle2, Lock, Unlock } from 'lucide-react';
import { Campaign } from '../types.ts';

interface FinancialMetricsProps {
  campaign: Campaign;
  onExecuteCuration: () => void;
}

export const FinancialMetrics: React.FC<FinancialMetricsProps> = ({ campaign, onExecuteCuration }) => {
  const isUnlocked = campaign.paidCount >= 12;
  const isFullyFunded = campaign.paidCount === 14;
  const collectionPercent = Math.round((campaign.totalCollectedUsd / campaign.targetGrossRevenue) * 100);
  const projectedNet = Math.max(0, campaign.totalCollectedUsd - campaign.operatingCostEst);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm text-slate-100 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-4 border-b border-slate-800">
        {/* Recaudación Total vs Meta */}
        <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
            <span>Facturación Recaudada</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              ${campaign.totalCollectedUsd.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              / ${campaign.targetGrossRevenue.toLocaleString()} USD
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2.5 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${
                isFullyFunded ? 'bg-emerald-500' : isUnlocked ? 'bg-amber-500' : 'bg-sky-500'
              }`}
              style={{ width: `${Math.min(100, collectionPercent)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1 flex justify-between">
            <span>{campaign.paidCount} de 14 slots pagados</span>
            <span className="font-semibold">{collectionPercent}%</span>
          </p>
        </div>

        {/* Costo Operativo Directo */}
        <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
            <span>Costo Operativo Estimado</span>
            <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-slate-200">
              ${campaign.operatingCostEst.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">USD</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Impresión 12"×9" 16pt cardstock + Ruta ECRWSS USPS para 5,000 hogares ($0.60/u).
          </p>
        </div>

        {/* Margen Neto Proyectado */}
        <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
            <span>Margen Neto Agencia</span>
            <DollarSign className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-amber-400">
              ${projectedNet.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              (Meta: ${campaign.netMarginEst.toLocaleString()})
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Rentabilidad neta objetivo: <strong className="text-amber-300">58.7%</strong> al completar la tirada.
          </p>
        </div>

        {/* Regla de Caja / Botón Maestro */}
        <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
              <span>Regla de Caja (Piso: 12)</span>
              {isUnlocked ? (
                <Unlock className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-rose-400" />
              )}
            </div>
            <div className="text-xs text-slate-300">
              {isFullyFunded ? (
                <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> 100% Financiada (14/14)
                </span>
              ) : isUnlocked ? (
                <span className="text-amber-300 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Piso de 12 Alcanzado ({campaign.paidCount}/14)
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1 font-semibold">
                  <AlertCircle className="w-4 h-4" /> Faltan {12 - campaign.paidCount} slots para piso
                </span>
              )}
            </div>
          </div>

          <button
            id="btn-master-curation"
            onClick={onExecuteCuration}
            disabled={!isUnlocked}
            className={`w-full mt-2 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
              isUnlocked
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 cursor-pointer animate-pulse'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            {isUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            <span>Ejecutar Curación Postal</span>
          </button>
        </div>
      </div>
    </div>
  );
};
