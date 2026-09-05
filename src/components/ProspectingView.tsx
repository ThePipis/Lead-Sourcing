import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Star, 
  Phone, 
  MapPin, 
  Sparkles, 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  DollarSign, 
  ExternalLink,
  Bot,
  Copy,
  Check,
  Building,
  Filter
} from 'lucide-react';
import { CLOSED_CATEGORIES } from '../data/categories.ts';
import { searchCategoryLeads } from '../services/leadSourcingService.ts';
import { LeadProspect, SlotState } from '../types.ts';

interface ProspectingViewProps {
  targetCity: string;
  targetZip: string;
  slots: SlotState[];
  onAssignLeadToSlot: (slotNumber: number, lead: LeadProspect) => void;
}

export const ProspectingView: React.FC<ProspectingViewProps> = ({
  targetCity,
  targetZip,
  slots,
  onAssignLeadToSlot,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(1);
  const [leads, setLeads] = useState<LeadProspect[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedPitchId, setCopiedPitchId] = useState<string | null>(null);
  const [pitchLang, setPitchLang] = useState<'es' | 'en'>('es');

  // Load leads for selected microzone and category
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    searchCategoryLeads(targetCity, targetZip, selectedCategoryId)
      .then((data) => {
        if (isMounted) {
          setLeads(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [targetCity, targetZip, selectedCategoryId]);

  const selectedCategory = CLOSED_CATEGORIES.find((c) => c.id === selectedCategoryId) || CLOSED_CATEGORIES[0];
  const assignedSlot = slots.find((s) => s.slotNumber === selectedCategoryId);

  const handleUpdateStatus = (leadId: string, newStatus: 'CONTACTED' | 'REJECTED' | 'WON') => {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
    );
  };

  const handleCopyPitch = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPitchId(id);
    setTimeout(() => setCopiedPitchId(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Category selector pill strip */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              14 Giros Cerrados con Exclusividad 1-a-1
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Filtrando candidatos Yelp + Geoapify (Rating ≥ 4.0, Reseñas ≥ 15)
          </span>
        </div>

        <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-none">
          {CLOSED_CATEGORIES.map((cat) => {
            const slot = slots.find((s) => s.slotNumber === cat.id);
            const isPaid = slot?.status === 'PAID';
            const isReserved = slot?.status === 'RESERVED';
            const isSelected = selectedCategoryId === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center space-x-1.5 border transition-all ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <span>#{cat.id}</span>
                <span>{cat.name}</span>
                {isPaid ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                ) : isReserved ? (
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Sourcing Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs text-slate-400 mb-1">
            <span className="font-mono font-bold text-amber-400">
              SLOT #{selectedCategory.id} • {selectedCategory.side === 'FRONT' ? 'Cara Frontal' : 'Cara Posterior'}
            </span>
            <span>•</span>
            <span>Precio: ${selectedCategory.priceUsd} USD</span>
            <span>•</span>
            <span>Ticket Promedio: ${selectedCategory.avgTicketUsd} USD</span>
          </div>
          <h2 className="text-xl font-bold text-white">{selectedCategory.name}</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">{selectedCategory.description}</p>
        </div>

        {/* Slot Current Status Preview */}
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs flex flex-col items-end">
          <span className="text-slate-400 text-[11px]">Estado actual del Slot #{selectedCategory.id}:</span>
          <span className={`font-bold uppercase tracking-wider mt-0.5 ${
            assignedSlot?.status === 'PAID'
              ? 'text-emerald-400'
              : assignedSlot?.status === 'RESERVED'
              ? 'text-amber-400'
              : 'text-slate-400'
          }`}>
            {assignedSlot?.status || 'VACANT'}
          </span>
          {assignedSlot?.businessName && (
            <span className="text-white font-medium truncate max-w-[200px]">
              {assignedSlot.businessName}
            </span>
          )}
        </div>
      </div>

      {/* Language Switcher for Local LLM Pitches */}
      <div className="flex items-center justify-between text-xs text-slate-300 px-1">
        <div className="flex items-center space-x-2">
          <Bot className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-white">Llama.cpp Local LLM:</span>
          <span>Guiones de Venta One-Shot personalizados al Ticket Promedio (${selectedCategory.avgTicketUsd})</span>
        </div>
        <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setPitchLang('es')}
            className={`px-2.5 py-1 rounded text-xs font-semibold ${
              pitchLang === 'es' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Español (ES)
          </button>
          <button
            onClick={() => setPitchLang('en')}
            className={`px-2.5 py-1 rounded text-xs font-semibold ${
              pitchLang === 'en' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            English (EN)
          </button>
        </div>
      </div>

      {/* Leads List */}
      {loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400 space-y-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-medium">Extrayendo candidatos de Yelp Fusion y Geoapify Places en {targetCity}...</p>
          <p className="text-xs text-slate-500 font-mono">Aplicando filtro de rating ≥ 4.0 y reseñas ≥ 15...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
          No se encontraron prospectos que cumplan los criterios para esta categoría en {targetCity}.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {leads.map((lead, idx) => {
            const pitch = lead.bilingualHooks[pitchLang];
            const isAssigned = assignedSlot?.businessName === lead.businessName;

            return (
              <div
                key={lead.id}
                className={`bg-slate-900 border rounded-xl p-5 transition-all space-y-4 ${
                  isAssigned
                    ? 'border-emerald-500 bg-emerald-950/10 shadow-lg shadow-emerald-950/20'
                    : lead.status === 'REJECTED'
                    ? 'border-slate-800 opacity-60'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Header row of lead */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-amber-400 font-mono">
                        TOP #{idx + 1}
                      </span>
                      <h3 className="text-base font-bold text-white">{lead.businessName}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                        {lead.source}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <div className="flex items-center space-x-1 text-amber-300">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span className="font-bold">{lead.rating}</span>
                        <span className="text-slate-500">({lead.reviewCount} reseñas)</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <span>{lead.address}, {lead.city}</span>
                      </div>
                      <div className="flex items-center space-x-1 text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span>{lead.phone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Decision Maker & Status */}
                  <div className="flex flex-col items-start sm:items-end">
                    <span className="text-[11px] text-slate-400">Decisor Detectado:</span>
                    <span className="text-xs font-semibold text-amber-300 font-mono">
                      {lead.decisionMaker}
                    </span>
                    <span className="text-[10px] text-slate-500">{lead.decisionMakerTitle}</span>
                  </div>
                </div>

                {/* Local LLM Pitch Box */}
                <div className="bg-slate-950 border border-slate-800/90 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-400 flex items-center gap-1.5 font-mono">
                      <Sparkles className="w-3.5 h-3.5" />
                      Gancho de Cierre Telefónico One-Shot ({pitchLang.toUpperCase()}):
                    </span>
                    <button
                      onClick={() => handleCopyPitch(lead.id, pitch)}
                      className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-2 py-0.5 rounded transition-colors"
                    >
                      {copiedPitchId === lead.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar Guion</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed italic bg-slate-900/50 p-2.5 rounded border border-slate-800/50">
                    "{pitch}"
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    <strong className="text-slate-300">ROI Económico:</strong> {lead.roiPitch}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-400">Estado CRM:</span>
                    <button
                      onClick={() => handleUpdateStatus(lead.id, 'CONTACTED')}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        lead.status === 'CONTACTED'
                          ? 'bg-sky-950 text-sky-300 border-sky-700'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      Contactado
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(lead.id, 'REJECTED')}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        lead.status === 'REJECTED'
                          ? 'bg-rose-950 text-rose-300 border-rose-700'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      Rechazado
                    </button>
                  </div>

                  {/* Assign to Slot button */}
                  <button
                    onClick={() => onAssignLeadToSlot(selectedCategory.id, lead)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                      isAssigned
                        ? 'bg-emerald-500 text-slate-950 cursor-default'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{isAssigned ? 'Asignado al Slot' : `Vendido / Asignar al Slot #${selectedCategory.id}`}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
