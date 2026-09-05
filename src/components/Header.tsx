import React from 'react';
import { 
  Mail, 
  MapPin, 
  ShieldCheck, 
  SlidersHorizontal, 
  Users, 
  FileSpreadsheet, 
  Code2, 
  Sparkles,
  Layers
} from 'lucide-react';
import { INLAND_EMPIRE_ZONES } from '../data/categories.ts';
import { Campaign } from '../types.ts';

interface HeaderProps {
  currentTab: 'canvas' | 'prospecting' | 'curation' | 'export' | 'architecture';
  setCurrentTab: (tab: 'canvas' | 'prospecting' | 'curation' | 'export' | 'architecture') => void;
  campaign: Campaign;
  onZoneChange: (city: string, zip: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  campaign,
  onZoneChange,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Platform Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold tracking-tight text-white text-base sm:text-lg">
                  Co-Op Direct Mail Platform
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950 text-amber-300 border border-amber-800">
                  Inland Empire, CA
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono hidden sm:block">
                12"×9" Jumbo Postcard • Algorithmic Propensity Curation Engine
              </p>
            </div>
          </div>

          {/* Microzone Selector */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-lg text-xs">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-300 font-medium hidden md:inline">Microzona:</span>
              <select
                id="zone-select"
                aria-label="Seleccionar Microzona"
                value={`${campaign.targetCity}-${campaign.targetZip}`}
                onChange={(e) => {
                  const [city, zip] = e.target.value.split('-');
                  onZoneChange(city, zip);
                }}
                className="bg-transparent text-amber-300 font-semibold focus:outline-none cursor-pointer"
              >
                {INLAND_EMPIRE_ZONES.map((z) => (
                  <option key={z.zip} value={`${z.city}-${z.zip}`} className="bg-slate-900 text-white">
                    {z.city}, CA {z.zip} ({z.county})
                  </option>
                ))}
              </select>
            </div>

            {/* Campaign Status Tag */}
            <div className={`hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              campaign.paidCount === 14
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                : campaign.paidCount >= 12
                ? 'bg-amber-950 text-amber-300 border-amber-700'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                {campaign.paidCount === 14 
                  ? 'LISTO PARA PRODUCCIÓN' 
                  : campaign.paidCount >= 12 
                  ? 'PISO OPERATIVO ALCANZADO' 
                  : `PROSPECCIÓN (${campaign.paidCount}/14 PAGADOS)`}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 sm:space-x-2 border-t border-slate-800/80 py-2 overflow-x-auto scrollbar-none">
          <button
            id="tab-canvas"
            onClick={() => setCurrentTab('canvas')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              currentTab === 'canvas'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>1. Tablero 12"×9" & Slots</span>
            <span className={`ml-1.5 px-1.5 py-0.2 rounded text-[10px] font-mono ${
              currentTab === 'canvas' ? 'bg-slate-950/20 text-slate-900' : 'bg-slate-800 text-slate-400'
            }`}>
              {campaign.paidCount}/14
            </span>
          </button>

          <button
            id="tab-prospecting"
            onClick={() => setCurrentTab('prospecting')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              currentTab === 'prospecting'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>2. Lead Sourcing (Yelp + LLM)</span>
          </button>

          <button
            id="tab-curation"
            onClick={() => setCurrentTab('curation')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              currentTab === 'curation'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>3. Propensity Engine (5k Hogares)</span>
            {campaign.status === 'CURATED' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            )}
          </button>

          <button
            id="tab-export"
            onClick={() => setCurrentTab('export')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              currentTab === 'export'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>4. QR & Exportación Postal</span>
          </button>

          <button
            id="tab-architecture"
            onClick={() => setCurrentTab('architecture')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              currentTab === 'architecture'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>Arquitectura FastAPI & DB</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
