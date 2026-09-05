import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  UploadCloud, 
  QrCode, 
  Sparkles, 
  Lock, 
  Unlock, 
  AlertCircle,
  Eye,
  CheckCheck,
  Building2,
  Tag
} from 'lucide-react';
import { CLOSED_CATEGORIES, USPS_TECHNICAL_SLOT } from '../data/categories.ts';
import { SlotState, SlotStatus, CardSide } from '../types.ts';

interface PostalCanvasProps {
  slots: SlotState[];
  onUpdateSlotStatus: (slotNumber: number, newStatus: SlotStatus) => void;
  onUpdateSlotBusiness: (slotNumber: number, businessName: string, headline?: string) => void;
  onQuickSimulateAllPaid: () => void;
  onExecuteCuration: () => void;
}

export const PostalCanvas: React.FC<PostalCanvasProps> = ({
  slots,
  onUpdateSlotStatus,
  onUpdateSlotBusiness,
  onQuickSimulateAllPaid,
  onExecuteCuration,
}) => {
  const [activeSide, setActiveSide] = useState<CardSide>('FRONT');
  const [selectedSlotNumber, setSelectedSlotNumber] = useState<number | null>(1);
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [tempBusinessName, setTempBusinessName] = useState('');
  const [tempHeadline, setTempHeadline] = useState('');

  const paidCount = slots.filter((s) => s.status === 'PAID').length;
  const isMasterUnlocked = paidCount >= 12;

  const frontCategories = CLOSED_CATEGORIES.filter((c) => c.side === 'FRONT');
  const backCategories = CLOSED_CATEGORIES.filter((c) => c.side === 'BACK');

  const getSlot = (slotNumber: number): SlotState => {
    return (
      slots.find((s) => s.slotNumber === slotNumber) || {
        slotNumber,
        categoryId: slotNumber,
        status: 'VACANT',
        priceUsd: 497,
        scanCount: 0,
      }
    );
  };

  const getStatusBadge = (status: SlotStatus) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
            <CheckCircle2 className="w-3 h-3 mr-1" /> PAID
          </span>
        );
      case 'RESERVED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700">
            <Clock className="w-3 h-3 mr-1" /> RESERVADO
          </span>
        );
      case 'PROSPECTING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-700">
            <Eye className="w-3 h-3 mr-1" /> EN NEGOCIACIÓN
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            VACANTE
          </span>
        );
    }
  };

  const handleOpenEdit = (slotNum: number) => {
    const s = getSlot(slotNum);
    setSelectedSlotNumber(slotNum);
    setTempBusinessName(s.businessName || '');
    setTempHeadline(s.offerHeadline || '');
    setIsEditingModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (selectedSlotNumber !== null) {
      onUpdateSlotBusiness(selectedSlotNumber, tempBusinessName, tempHeadline);
      setIsEditingModalOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="flex items-center space-x-3">
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              id="btn-side-front"
              onClick={() => setActiveSide('FRONT')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                activeSide === 'FRONT'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Cara Frontal (Hero + 6 Estándar)
            </button>
            <button
              id="btn-side-back"
              onClick={() => setActiveSide('BACK')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                activeSide === 'BACK'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Cara Posterior (6 Est. + 1 Med. + USPS)
            </button>
          </div>
          <span className="text-xs text-slate-400 hidden lg:inline font-mono">
            Dimensiones Físicas: 12.0" × 9.0" (30.48 cm × 22.86 cm)
          </span>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto justify-between sm:justify-end">
          {/* Quick Demo Filler */}
          <button
            id="btn-quick-fill-paid"
            onClick={onQuickSimulateAllPaid}
            className="text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors"
            title="Marca todos los 14 slots como PAID para desbloquear curación postal instantáneamente"
          >
            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Autollenar 14 PAID (Demo)</span>
          </button>

          {/* Master Trigger */}
          <button
            id="btn-trigger-curation-canvas"
            onClick={onExecuteCuration}
            disabled={!isMasterUnlocked}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 transition-all ${
              isMasterUnlocked
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 cursor-pointer animate-pulse'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            {isMasterUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            <span>Ejecutar Curación Postal</span>
          </button>
        </div>
      </div>

      {/* Scaled Postcard Frame 12" x 9" */}
      <div className="relative bg-slate-950 border-2 border-dashed border-slate-700/80 rounded-2xl p-4 sm:p-6 shadow-2xl overflow-hidden">
        {/* Physical measurements rulers indicator */}
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pb-2 border-b border-slate-800/80 mb-4">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
            <span className="font-semibold text-slate-200">
              {activeSide === 'FRONT' ? 'CARA FRONTAL (ANVERSO)' : 'CARA POSTERIOR (REVERSO)'}
            </span>
          </div>
          <span>ANCHO: 12.0 PULGADAS (304.8 mm) • ALTO: 9.0 PULGADAS (228.6 mm)</span>
        </div>

        {/* The Card Surface */}
        <div className="bg-slate-900 border-4 border-slate-700 rounded-xl p-4 shadow-inner min-h-[580px] flex flex-col justify-between">
          {activeSide === 'FRONT' ? (
            /* FRONT LAYOUT:
               Row 1: 1 Hero Banner (9.0" x 3.2" - $850) occupying full dominant top width
               Row 2: 3 Standard slots (4.3" x 4.2" - $497)
               Row 3: 3 Standard slots (4.3" x 4.2" - $497)
            */
            <div className="space-y-3 flex-1 flex flex-col">
              {/* HERO BANNER - Slot 1 */}
              {(() => {
                const heroDef = frontCategories[0];
                const heroSlot = getSlot(1);
                return (
                  <div
                    key={1}
                    className={`relative rounded-xl border-2 transition-all p-4 flex flex-col justify-between min-h-[140px] cursor-pointer ${
                      heroSlot.status === 'PAID'
                        ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-600/80 shadow-emerald-950/30'
                        : heroSlot.status === 'RESERVED'
                        ? 'bg-amber-950/30 border-amber-600/70'
                        : 'bg-slate-950/60 border-slate-700 hover:border-slate-500'
                    }`}
                    onClick={() => handleOpenEdit(1)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500 text-slate-950 tracking-wider">
                            SLOT 1 • HERO BANNER (9.0" × 3.2")
                          </span>
                          <span className="text-xs font-mono font-bold text-amber-400">
                            ${heroDef.priceUsd} USD
                          </span>
                          {getStatusBadge(heroSlot.status)}
                        </div>
                        <h3 className="text-base font-bold text-white tracking-tight">
                          {heroSlot.businessName || heroDef.name}
                        </h3>
                        <p className="text-xs text-slate-400 line-clamp-1">
                          {heroSlot.offerHeadline || heroDef.defaultHeadline}
                        </p>
                      </div>

                      <div className="flex flex-col items-end space-y-1">
                        <span className="text-[10px] text-slate-400 font-mono">
                          Ticket Promedio: ${heroDef.avgTicketUsd}
                        </span>
                        <div className="flex items-center space-x-1.5 pt-1">
                          <select
                            aria-label="Estado Slot 1"
                            value={heroSlot.status}
                            onChange={(e) => {
                              e.stopPropagation();
                              onUpdateSlotStatus(1, e.target.value as SlotStatus);
                            }}
                            className="bg-slate-800 text-slate-200 border border-slate-700 text-xs rounded px-2 py-1 font-semibold focus:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="VACANT">Vacante</option>
                            <option value="PROSPECTING">En Negociación</option>
                            <option value="RESERVED">Reservado</option>
                            <option value="PAID">Pagado ($850)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                      <span>Exclusividad 1-a-1: Odontología Familiar e Implantes</span>
                      <span className="text-amber-400 hover:underline">Click para editar arte/titular &rarr;</span>
                    </div>
                  </div>
                );
              })()}

              {/* 6 STANDARD SLOTS (Slots 2 to 7) - 3 columns x 2 rows */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
                {frontCategories.slice(1).map((catDef) => {
                  const s = getSlot(catDef.id);
                  return (
                    <div
                      key={catDef.id}
                      className={`relative rounded-xl border-2 transition-all p-3 flex flex-col justify-between cursor-pointer ${
                        s.status === 'PAID'
                          ? 'bg-slate-900 border-emerald-600/70 shadow-sm'
                          : s.status === 'RESERVED'
                          ? 'bg-amber-950/20 border-amber-600/60'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-600'
                      }`}
                      onClick={() => handleOpenEdit(catDef.id)}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-mono text-slate-400 font-bold">
                            SLOT {catDef.id} • 4.3" × 4.2"
                          </span>
                          <span className="text-xs font-mono font-bold text-amber-400">
                            ${catDef.priceUsd} USD
                          </span>
                        </div>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-xs font-bold text-white line-clamp-1">
                            {s.businessName || catDef.name}
                          </h4>
                          {getStatusBadge(s.status)}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                          {s.offerHeadline || catDef.defaultHeadline}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between mt-2">
                        <span className="text-[10px] text-slate-400 font-mono">
                          Ticket: ${catDef.avgTicketUsd}
                        </span>
                        <select
                          aria-label={`Estado Slot ${catDef.id}`}
                          value={s.status}
                          onChange={(e) => {
                            e.stopPropagation();
                            onUpdateSlotStatus(catDef.id, e.target.value as SlotStatus);
                          }}
                          className="bg-slate-800 text-slate-200 border border-slate-700 text-[11px] rounded px-1.5 py-0.5 font-medium focus:outline-none"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="VACANT">Vacante</option>
                          <option value="PROSPECTING">Negociando</option>
                          <option value="RESERVED">Reservado</option>
                          <option value="PAID">Pagado ($497)</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* BACK LAYOUT:
               6 Standard slots (4.3" x 3.8" - $497) (Slots 8 to 13)
               + 1 Medium slot (4.3" x 3.6" - $450) (Slot 14)
               + 1 USPS Technical Reserved Area (4.3" x 3.6")
            */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
              {backCategories.map((catDef) => {
                const s = getSlot(catDef.id);
                const isMedium = catDef.slotType === 'MEDIUM_BACK';
                return (
                  <div
                    key={catDef.id}
                    className={`relative rounded-xl border-2 transition-all p-3 flex flex-col justify-between cursor-pointer ${
                      s.status === 'PAID'
                        ? 'bg-slate-900 border-emerald-600/70 shadow-sm'
                        : s.status === 'RESERVED'
                        ? 'bg-amber-950/20 border-amber-600/60'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-600'
                    }`}
                    onClick={() => handleOpenEdit(catDef.id)}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-mono text-slate-400 font-bold">
                          SLOT {catDef.id} • {catDef.widthInches}" × {catDef.heightInches}"
                          {isMedium && ' (MED)'}
                        </span>
                        <span className="text-xs font-mono font-bold text-amber-400">
                          ${catDef.priceUsd} USD
                        </span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-xs font-bold text-white line-clamp-1">
                          {s.businessName || catDef.name}
                        </h4>
                        {getStatusBadge(s.status)}
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                        {s.offerHeadline || catDef.defaultHeadline}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between mt-2">
                      <span className="text-[10px] text-slate-400 font-mono">
                        Ticket: ${catDef.avgTicketUsd}
                      </span>
                      <select
                        aria-label={`Estado Slot ${catDef.id}`}
                        value={s.status}
                        onChange={(e) => {
                          e.stopPropagation();
                          onUpdateSlotStatus(catDef.id, e.target.value as SlotStatus);
                        }}
                        className="bg-slate-800 text-slate-200 border border-slate-700 text-[11px] rounded px-1.5 py-0.5 font-medium focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="VACANT">Vacante</option>
                        <option value="PROSPECTING">Negociando</option>
                        <option value="RESERVED">Reservado</option>
                        <option value="PAID">Pagado (${catDef.priceUsd})</option>
                      </select>
                    </div>
                  </div>
                );
              })}

              {/* TECHNICAL USPS RESERVED AREA (Indicia + Address Block) */}
              <div className="rounded-xl border-2 border-dashed border-amber-600/60 bg-amber-950/20 p-3 flex flex-col justify-between text-slate-200">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black tracking-wider text-amber-400 font-mono">
                      USPS TECHNICAL AREA
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">4.3" × 3.6"</span>
                  </div>

                  {/* Postal Indicia Mock */}
                  <div className="border border-slate-600 p-1.5 text-center text-[9px] font-mono uppercase bg-slate-900/80 leading-tight">
                    <p className="font-bold text-white">PRSRT STD</p>
                    <p>ECRWSS</p>
                    <p>U.S. POSTAGE PAID</p>
                    <p>EASTVALE, CA</p>
                    <p>PERMIT NO. 488</p>
                  </div>

                  {/* Recipient Window Simulation */}
                  <div className="border border-dashed border-slate-700 p-2 rounded bg-slate-950/60 text-[10px] font-mono">
                    <p className="text-amber-300 font-bold">*****ECRWSS**C012</p>
                    <p className="text-white">RESIDENT OR CURRENT RESIDENT</p>
                    <p className="text-slate-400">14258 CITRUS VALLEY PKWY</p>
                    <p className="text-slate-400">EASTVALE, CA 92880-4521</p>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-800">
                  Espacio reservado oficial para entrega sin franqueo individual.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Slot Modal */}
      {isEditingModalOpen && selectedSlotNumber !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Building2 className="w-4 h-4 text-amber-400" />
                  <span>Configurar Slot #{selectedSlotNumber}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  {CLOSED_CATEGORIES.find((c) => c.id === selectedSlotNumber)?.name}
                </p>
              </div>
              <button
                onClick={() => setIsEditingModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nombre Comercial del Negocio</label>
                <input
                  type="text"
                  value={tempBusinessName}
                  onChange={(e) => setTempBusinessName(e.target.value)}
                  placeholder="Ej: Eastvale Family Dentistry"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Oferta / Titular Promocional en Postal</label>
                <textarea
                  rows={3}
                  value={tempHeadline}
                  onChange={(e) => setTempHeadline(e.target.value)}
                  placeholder="Ej: $79 Examen + Rayos X + Limpieza Dental Completa..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-300">
                  <UploadCloud className="w-4 h-4 text-amber-400" />
                  <span>Arte / Logotipo Vectorial (300 DPI)</span>
                </div>
                <button
                  type="button"
                  onClick={() => alert('Carga simulada de archivo de arte en alta resolución (PDF/AI/TIFF 300 DPI).')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
                >
                  Cargar Arte
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsEditingModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
