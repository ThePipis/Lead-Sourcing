import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Clock,
  Eye,
  CheckCheck,
  Building2,
  Loader2,
  GripVertical,
  RotateCcw,
  Sparkles,
  Phone,
  MapPin,
  Maximize2,
  Minimize2,
  AlertTriangle,
  ChevronDown,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensors,
  useSensor,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { CLOSED_CATEGORIES, USPS_TECHNICAL_SLOT } from '../data/categories.ts';
import { SlotState, SlotStatus, CardSide, SlotFormat, CategoryDefinition } from '../types.ts';
import {
  normalizeModularSlots,
  canMergeVertical,
  canMergeLarge,
  mergeModularSlot,
  splitModularSlot,
  formatReservationCountdown,
  isReservationExpired,
  MODULAR_PRICES,
} from '../utils/modularGrid.ts';

const USPS_DROP_ID = 'usps-technical-zone';

export interface PostalCanvasProps {
  slots: SlotState[];
  onUpdateSlotStatus: (slotNumber: number, newStatus: SlotStatus) => void;
  onUpdateSlotBusiness: (slotNumber: number, businessName: string, headline?: string) => void;
  onUpdateSlotPrice?: (slotNumber: number, newPrice: number) => void;
  onUpdateSlotAvgTicket?: (slotNumber: number, newAvgTicket: number) => void;
  onSwapSlots?: (sourceSlotNumber: number, targetSlotNumber: number) => void;
  onMergeSlot?: (slotNumber: number, targetFormat: 'MEDIUM' | 'LARGE') => void;
  onSplitSlot?: (slotNumber: number) => void;
  onReleaseReservation?: (slotNumber: number) => void;
  onResetLayout?: (wipe: boolean) => void;
  coveredHouseholds?: number;
  selectedRoutes?: number;
  onAutofill?: () => void;
  onMarkAllPaid?: () => void;
  onUndoPayment?: (slotNumber: number) => void;
  isDemo?: boolean;
  onInspectSlot?: (slotNumber: number) => void;
  selectedSlot?: number | null;
  onNextCandidate?: (slotNumber: number) => void;
  isFilling?: boolean;
  busySlot?: number | null;
  onQuickSimulateAllPaid?: () => void;
  onExecuteCuration?: () => void;
  isSaving?: boolean;
  isLoading?: boolean;
  inspectorOpen?: boolean;
  onCloseInspector?: () => void;
  inspectorNode?: React.ReactNode;
}

function useSlotDrag(id: number, locked = false) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id,
    disabled: locked,
  });
  const { setNodeRef: setDropRef, isOver, active } = useDroppable({ id });
  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };
  return {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    isOver: isOver && Number(active?.id) !== id,
  };
}

export const PostalCanvas: React.FC<PostalCanvasProps> = ({
  slots: rawSlots,
  onUpdateSlotStatus,
  onUpdateSlotBusiness,
  onUpdateSlotPrice,
  onUpdateSlotAvgTicket,
  onSwapSlots,
  onMergeSlot,
  onSplitSlot,
  onReleaseReservation,
  onResetLayout,
  coveredHouseholds = 0,
  selectedRoutes = 0,
  onAutofill,
  onInspectSlot,
  selectedSlot = null,
  onMarkAllPaid,
  onUndoPayment,
  isDemo = false,
  onNextCandidate,
  isFilling = false,
  busySlot = null,
  onQuickSimulateAllPaid,
  onExecuteCuration,
  isSaving = false,
  isLoading = false,
  inspectorOpen = false,
  onCloseInspector,
  inspectorNode = null,
}) => {
  const { t } = useTranslation(['canvas', 'common']);
  const [activeSide, setActiveSide] = useState<CardSide>('FRONT');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [formatMenuSlot, setFormatMenuSlot] = useState<number | null>(null);
  const [, setTimerTick] = useState(0);

  // Normalize slots to ensure modular 31+1 grid geometry
  const slots = normalizeModularSlots(rawSlots);

  // Refresh countdown timer every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick((t) => t + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Sync side with selected slot
  useEffect(() => {
    if (selectedSlot != null) {
      setActiveSide(selectedSlot > 16 ? 'BACK' : 'FRONT');
    }
  }, [selectedSlot]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => setDraggingSlot(Number(event.active.id));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingSlot(null);
    if (!over || !onSwapSlots) return;
    if (over.id === USPS_DROP_ID) return;
    const activeId = Number(active.id);
    const overId = Number(over.id);
    if (activeId !== overId) onSwapSlots(activeId, overId);
  };

  const paidCount = slots.filter((s) => s.status === 'PAID' && s.format !== 'USPS').length;
  const isMasterUnlocked = paidCount >= 10;

  // Split slots into Front & Back and filter out slots covered by merged parents
  const visibleSlots = slots.filter((s) => {
    if (s.notes?.startsWith('Covered by')) return false;
    return true;
  });

  const frontSlots = visibleSlots.filter((s) => s.slotNumber <= 16);
  const backSlots = visibleSlots.filter((s) => s.slotNumber >= 17 && s.slotNumber <= 32);

  const frontTop = frontSlots.filter((s) => (s.gridRow ?? 1) <= 2);
  const frontBottom = frontSlots.filter((s) => (s.gridRow ?? 1) >= 3);

  const backTop = backSlots.filter((s) => (s.gridRow ?? 1) <= 2);
  const backBottom = backSlots.filter((s) => (s.gridRow ?? 1) >= 3);

  // Handlers for merging / splitting
  const handleMerge = (slotNumber: number, targetFormat: 'MEDIUM' | 'LARGE') => {
    setFormatMenuSlot(null);
    if (onMergeSlot) {
      onMergeSlot(slotNumber, targetFormat);
    } else {
      // Fallback local update
      const updated = mergeModularSlot(slotNumber, targetFormat, slots);
      const target = updated.find((s) => s.slotNumber === slotNumber);
      if (target && onUpdateSlotPrice) {
        onUpdateSlotPrice(slotNumber, target.priceUsd);
      }
    }
  };

  const handleSplit = (slotNumber: number) => {
    setFormatMenuSlot(null);
    if (onSplitSlot) {
      onSplitSlot(slotNumber);
    } else {
      const updated = splitModularSlot(slotNumber, slots);
      const target = updated.find((s) => s.slotNumber === slotNumber);
      if (target && onUpdateSlotPrice) {
        onUpdateSlotPrice(slotNumber, target.priceUsd);
      }
    }
  };

  const handleRelease = (slotNumber: number) => {
    if (onReleaseReservation) {
      onReleaseReservation(slotNumber);
    } else {
      onUpdateSlotStatus(slotNumber, 'VACANT');
    }
  };

  return (
    <div className="space-y-4 min-w-0">
      {/* Control Bar */}
      <div className="flex flex-col gap-3 sm:gap-4 bg-card border border-border p-3 sm:p-4 text-card-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Front / Back Toggle */}
            <div className="flex bg-secondary p-1 border border-border">
              <button
                id="btn-side-front"
                type="button"
                onClick={() => setActiveSide('FRONT')}
                className={`px-4 py-1.5 text-xs font-bold transition-colors cursor-pointer border ${
                  activeSide === 'FRONT'
                    ? 'bg-live border-live text-primary-foreground'
                    : 'bg-card border-border text-secondary-foreground hover:bg-accent'
                }`}
              >
                Cara Frontal (16 Espacios)
              </button>
              <button
                id="btn-side-back"
                type="button"
                onClick={() => setActiveSide('BACK')}
                className={`px-4 py-1.5 text-xs font-bold transition-colors cursor-pointer border ${
                  activeSide === 'BACK'
                    ? 'bg-live border-live text-primary-foreground'
                    : 'bg-card border-border text-secondary-foreground hover:bg-accent'
                }`}
              >
                Cara Reversa (15 Espacios + USPS)
              </button>
            </div>

            <div className="hidden lg:flex items-center gap-2 text-[0.69rem] font-mono text-muted-foreground border-l border-border pl-3">
              <span className="font-semibold text-foreground">Postcard Jumbo 12" × 9"</span>
              <span>· Formato Modular Dinámico</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onAutofill && (
              <button
                id="btn-autofill-slots"
                type="button"
                onClick={onAutofill}
                disabled={isFilling || isSaving}
                className="flex min-h-10 items-center gap-1.5 border border-live bg-live px-3.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isFilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Autollenar Prospectos
              </button>
            )}

            {isDemo && onMarkAllPaid && (
              <button
                id="btn-mark-all-paid"
                type="button"
                onClick={onMarkAllPaid}
                disabled={isSaving}
                className="flex min-h-10 items-center gap-1.5 border border-clear px-3 text-xs font-bold text-clear transition-colors hover:bg-clear hover:text-background disabled:opacity-40"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar Todos Pagados
              </button>
            )}

            {onResetLayout && (
              <button
                id="btn-reset-layout"
                type="button"
                onClick={() => onResetLayout(isDemo)}
                disabled={isSaving}
                className="flex min-h-10 items-center gap-1.5 border border-border px-3 text-xs font-bold text-secondary-foreground hover:bg-secondary"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reiniciar
              </button>
            )}

            {onExecuteCuration && (
              <button
                id="btn-trigger-curation-canvas"
                type="button"
                onClick={onExecuteCuration}
                disabled={!isMasterUnlocked}
                className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
                  isMasterUnlocked
                    ? 'bg-clear text-primary-foreground cursor-pointer shadow-sm'
                    : 'bg-muted text-muted-foreground cursor-not-allowed border border-border'
                }`}
              >
                <span>Curar Audiencia Postal</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Postcard Physical Frame (12" x 9") */}
      <div className="relative bg-canvas-bg border border-dashed border-border p-3 sm:p-5 overflow-x-auto">
        <div className="min-w-[720px]">
          {/* Legend and format indicators */}
          <div className="flex items-center justify-between text-[0.69rem] font-mono text-muted-foreground pb-2.5 border-b border-border mb-3">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-live inline-block"></span>
                <span className="font-bold text-foreground">
                  {activeSide === 'FRONT' ? 'CARA FRONTAL (ANVERSO)' : 'CARA TRASERA (REVERSO)'}
                </span>
              </span>
              <span className="text-muted-foreground hidden sm:inline">|</span>
              <span className="flex items-center gap-3 hidden sm:flex text-ink">
                <span>🟩 Chico: $350 (1×1)</span>
                <span>🟦 Mediano: $650 (1×2)</span>
                <span>🟪 Grande: $1,200 (2×2)</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Clic en un espacio para llamar o editar</span>
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDraggingSlot(null)}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          >
            {/* Sheet Canvas with Postcard Texture */}
            <div className="border-4 border-border bg-card p-3 sm:p-4 text-foreground shadow-sm">
              {activeSide === 'FRONT' ? (
                /* ======================== FRONT FACE ======================== */
                <div className="space-y-3">
                  {/* Top Block: Rows 1 & 2 (8 atomic cells) */}
                  <div className="grid grid-cols-4 grid-rows-2 gap-2.5">
                    {frontTop.map((slot) => (
                      <ModularSlotCard
                        key={slot.slotNumber}
                        slot={slot}
                        allSlots={slots}
                        isSelected={selectedSlot === slot.slotNumber}
                        onInspect={onInspectSlot}
                        onMerge={handleMerge}
                        onSplit={handleSplit}
                        onRelease={handleRelease}
                        onUpdateStatus={onUpdateSlotStatus}
                        busy={busySlot === slot.slotNumber}
                        onNextCandidate={onNextCandidate}
                        menuOpen={formatMenuSlot === slot.slotNumber}
                        onToggleMenu={(num) => setFormatMenuSlot(formatMenuSlot === num ? null : num)}
                        onCloseMenu={() => setFormatMenuSlot(null)}
                        blockRowOffset={0}
                      />
                    ))}
                  </div>

                  {/* Center Front Banner (The Clarion Spotlight / Co-Op Style) */}
                  <div className="border-y-2 border-border bg-secondary/80 py-2.5 px-4 text-center select-none shadow-inner">
                    <div className="flex items-center justify-between text-[0.65rem] font-mono uppercase tracking-widest text-muted-foreground">
                      <span>Edición Comunitaria Inland Empire</span>
                      <span>Otoño - Invierno 2026</span>
                    </div>
                    <h2 className="text-base sm:text-lg font-black tracking-tight text-foreground uppercase mt-0.5">
                      ★ The Inland Spotlight · Eastvale Local Co-Op ★
                    </h2>
                    <p className="text-[0.68rem] text-muted-foreground">
                      Cupónera Comunitaria Directa a 5,000 Hogares Seleccionados · Co-Op Direct Mail
                    </p>
                  </div>

                  {/* Bottom Block: Rows 3 & 4 (8 atomic cells) */}
                  <div className="grid grid-cols-4 grid-rows-2 gap-2.5">
                    {frontBottom.map((slot) => (
                      <ModularSlotCard
                        key={slot.slotNumber}
                        slot={slot}
                        allSlots={slots}
                        isSelected={selectedSlot === slot.slotNumber}
                        onInspect={onInspectSlot}
                        onMerge={handleMerge}
                        onSplit={handleSplit}
                        onRelease={handleRelease}
                        onUpdateStatus={onUpdateSlotStatus}
                        busy={busySlot === slot.slotNumber}
                        onNextCandidate={onNextCandidate}
                        menuOpen={formatMenuSlot === slot.slotNumber}
                        onToggleMenu={(num) => setFormatMenuSlot(formatMenuSlot === num ? null : num)}
                        onCloseMenu={() => setFormatMenuSlot(null)}
                        blockRowOffset={2}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                /* ======================== BACK FACE ======================== */
                <div className="space-y-3">
                  {/* Top Block: Rows 1 & 2 (8 atomic cells) */}
                  <div className="grid grid-cols-4 grid-rows-2 gap-2.5">
                    {backTop.map((slot) => (
                      <ModularSlotCard
                        key={slot.slotNumber}
                        slot={slot}
                        allSlots={slots}
                        isSelected={selectedSlot === slot.slotNumber}
                        onInspect={onInspectSlot}
                        onMerge={handleMerge}
                        onSplit={handleSplit}
                        onRelease={handleRelease}
                        onUpdateStatus={onUpdateSlotStatus}
                        busy={busySlot === slot.slotNumber}
                        onNextCandidate={onNextCandidate}
                        menuOpen={formatMenuSlot === slot.slotNumber}
                        onToggleMenu={(num) => setFormatMenuSlot(formatMenuSlot === num ? null : num)}
                        onCloseMenu={() => setFormatMenuSlot(null)}
                        blockRowOffset={0}
                      />
                    ))}
                  </div>

                  {/* Center Back Banner */}
                  <div className="border-y-2 border-border bg-live/10 py-2 px-4 text-center select-none">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-black tracking-wide text-foreground uppercase">
                        Apoya a tus Negocios Locales del Vecindario
                      </span>
                      <span className="text-xs font-mono font-bold text-live bg-card px-2 py-0.5 border border-live/30">
                        ¿Quieres tu espacio aquí? Llama: (951) 842-1200
                      </span>
                    </div>
                  </div>

                  {/* Bottom Block: Rows 3 & 4 (7 atomic slots + 1 USPS fixed zone at row 4, col 4) */}
                  <div className="grid grid-cols-4 grid-rows-2 gap-2.5">
                    {backBottom.map((slot) => {
                      if (slot.format === 'USPS' || slot.slotNumber === 32) {
                        return (
                          <UspsZoneCard
                            key={32}
                            coveredHouseholds={coveredHouseholds}
                            selectedRoutes={selectedRoutes}
                          />
                        );
                      }
                      return (
                        <ModularSlotCard
                          key={slot.slotNumber}
                          slot={slot}
                          allSlots={slots}
                          isSelected={selectedSlot === slot.slotNumber}
                          onInspect={onInspectSlot}
                          onMerge={handleMerge}
                          onSplit={handleSplit}
                          onRelease={handleRelease}
                          onUpdateStatus={onUpdateSlotStatus}
                          busy={busySlot === slot.slotNumber}
                          onNextCandidate={onNextCandidate}
                          menuOpen={formatMenuSlot === slot.slotNumber}
                          onToggleMenu={(num) => setFormatMenuSlot(formatMenuSlot === num ? null : num)}
                          onCloseMenu={() => setFormatMenuSlot(null)}
                          blockRowOffset={2}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Slide-over Inspector Drawer */}
            {inspectorNode && (
              <>
                <div
                  className={`fixed inset-0 bg-background/50 backdrop-blur-[1px] z-40 lg:hidden transition-opacity duration-300 ${
                    inspectorOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                  onClick={onCloseInspector}
                  aria-hidden="true"
                />

                <aside
                  className={`fixed inset-y-0 right-0 z-50 w-full max-w-[440px] sm:max-w-[460px] bg-card border-l-2 border-border shadow-2xl transition-transform duration-300 ease-out flex flex-col overscroll-contain ${
                    inspectorOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
                  }`}
                  aria-hidden={!inspectorOpen}
                  role="dialog"
                  aria-modal="false"
                  onClick={(e) => e.stopPropagation()}
                >
                  {inspectorNode}
                </aside>
              </>
            )}

            {/* Drag Overlay */}
            <DragOverlay dropAnimation={null}>
              {draggingSlot !== null && (
                <div className="border border-live bg-card px-3 py-2 shadow-xl">
                  <p className="font-mono text-[0.63rem] font-bold text-live">
                    ESPACIO #{draggingSlot}
                  </p>
                  <p className="text-xs font-bold text-foreground">
                    {slots.find((s) => s.slotNumber === draggingSlot)?.businessName || 'Comercio Local'}
                  </p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    </div>
  );
};

/* ========================================================================= */
/* MODULAR SLOT CARD COMPONENT (Supports SMALL, MEDIUM, LARGE)               */
/* ========================================================================= */
interface ModularSlotCardProps {
  slot: SlotState;
  allSlots: SlotState[];
  isSelected: boolean;
  onInspect?: (slotNumber: number) => void;
  onMerge: (slotNumber: number, format: 'MEDIUM' | 'LARGE') => void;
  onSplit: (slotNumber: number) => void;
  onRelease: (slotNumber: number) => void;
  onUpdateStatus: (slotNumber: number, status: SlotStatus) => void;
  busy?: boolean;
  onNextCandidate?: (slotNumber: number) => void;
  menuOpen: boolean;
  onToggleMenu: (slotNumber: number) => void;
  onCloseMenu?: () => void;
  blockRowOffset: number;
}

const ModularSlotCard: React.FC<ModularSlotCardProps> = ({
  slot,
  allSlots,
  isSelected,
  onInspect,
  onMerge,
  onSplit,
  onRelease,
  onUpdateStatus,
  busy,
  onNextCandidate,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  blockRowOffset,
}) => {
  const isPaid = slot.status === 'PAID';
  const isReserved = slot.status === 'RESERVED';
  const isProspecting = slot.status === 'PROSPECTING';
  const isVacant = slot.status === 'VACANT';
  const isExpired = isReservationExpired(slot);

  const format = slot.format || 'SMALL';
  const colSpan = slot.colSpan || (format === 'LARGE' ? 2 : 1);
  const rowSpan = slot.rowSpan || (format === 'LARGE' ? 2 : format === 'MEDIUM' ? 2 : 1);

  const gridCol = slot.gridCol || 1;
  const rawRow = slot.gridRow || 1;
  const gridRow = Math.max(1, rawRow - blockRowOffset);

  const { attributes, listeners, setNodeRef, isOver } = useSlotDrag(slot.slotNumber, isPaid);

  const catDef = CLOSED_CATEGORIES.find((c) => c.id === slot.categoryId) ?? CLOSED_CATEGORIES[0];
  const canMergeMed = canMergeVertical(slot, allSlots);
  const canMergeLg = canMergeLarge(slot, allSlots);

  // Ref and click-outside/escape listener for the "Modificar" dropdown
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        if (onCloseMenu) {
          onCloseMenu();
        } else {
          onToggleMenu(slot.slotNumber);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onCloseMenu) {
          onCloseMenu();
        } else {
          onToggleMenu(slot.slotNumber);
        }
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen, onCloseMenu, onToggleMenu, slot.slotNumber]);

  // Status visual border
  const statusBorderClass = isPaid
    ? 'border-clear border-l-4 border-l-clear bg-clear/10'
    : isReserved
    ? isExpired
      ? 'border-due border-l-4 border-l-due bg-due/15'
      : 'border-due/70 border-l-4 border-l-due bg-due/10'
    : isProspecting
    ? 'border-live border-l-4 border-l-live bg-card'
    : 'border-dashed border-border border-l-4 border-l-muted-foreground/30 bg-card hover:border-muted-foreground/60';

  const formatBadge = {
    SMALL: { label: 'Chico (1×1)', color: 'bg-secondary text-ink-dim', price: 350 },
    MEDIUM: { label: 'Mediano (1×2)', color: 'bg-live/15 text-live font-bold', price: 650 },
    LARGE: { label: 'Grande (2×2)', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 font-black', price: 1200 },
    USPS: { label: 'USPS Postal', color: 'bg-secondary text-muted-foreground', price: 0 },
  }[format];

  return (
    <div
      ref={setNodeRef}
      onClick={() => onInspect?.(slot.slotNumber)}
      style={{
        gridColumn: `${gridCol} / span ${colSpan}`,
        gridRow: `${gridRow} / span ${rowSpan}`,
      }}
      className={`relative flex flex-col justify-between p-2.5 sm:p-3 border transition-all cursor-pointer select-none bg-card ${
        rowSpan === 2 ? 'min-h-[220px]' : 'min-h-[105px]'
      } ${statusBorderClass} ${
        isSelected ? 'ring-2 ring-live shadow-md' : ''
      } ${isOver ? 'scale-[1.01] ring-2 ring-primary' : ''}`}
    >
      {/* Top Header: Slot Number + Format Tag + Price */}
      <div>
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[0.62rem] font-black text-muted-foreground">
              #{slot.slotNumber}
            </span>
            <span className={`text-[0.58rem] px-1 py-0.2 rounded border border-rule/50 ${formatBadge.color}`}>
              {formatBadge.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <span className="font-mono text-xs font-black text-foreground">
              ${slot.priceUsd || formatBadge.price}
            </span>

            {/* Drag Handle */}
            {!isPaid && (
              <button
                type="button"
                {...attributes}
                {...listeners}
                className="text-muted-foreground hover:text-foreground p-0.5 cursor-grab touch-none"
                title="Arrastrar para intercambiar posición"
              >
                <GripVertical className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* 72h Reservation Timer Badge */}
        {isReserved && (
          <div className="mb-1.5">
            <div
              className={`flex items-center justify-between px-1.5 py-0.5 rounded text-[0.6rem] font-bold border ${
                isExpired
                  ? 'bg-due/20 border-due text-due animate-pulse'
                  : 'bg-due/15 border-due/40 text-due'
              }`}
            >
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {isExpired ? '🚨 RESERVA EXPIRADA' : `⏳ ${formatReservationCountdown(slot)}`}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRelease(slot.slotNumber);
                }}
                className="ml-1 text-[0.58rem] underline hover:text-due-dark font-black"
                title="Liberar slot y devolver a vacante"
              >
                Liberar
              </button>
            </div>
          </div>
        )}

        {/* Business Name & Niche */}
        <div className="mt-0.5">
          <h4 className="text-xs font-bold line-clamp-1 text-foreground">
            {slot.businessName || (
              <span className="text-muted-foreground italic font-medium">
                {slot.categoryName || catDef.name}
              </span>
            )}
          </h4>

          {slot.phone && (
            <p className="text-[0.62rem] font-mono text-muted-foreground flex items-center gap-1 mt-0.5">
              <Phone className="h-2.5 w-2.5 text-live shrink-0" />
              {slot.phone}
            </p>
          )}

          <p className="text-[0.65rem] text-muted-foreground line-clamp-2 mt-1 leading-tight">
            {slot.offerHeadline || catDef.defaultHeadline}
          </p>
        </div>
      </div>

      {/* Bottom Footer: Format Modifiers & Status Dropdown */}
      <div className="pt-2 border-t border-border/70 flex items-center justify-between gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
        {/* Format Selector / Revert Button */}
        <div ref={menuRef} className="relative">
          {format === 'SMALL' ? (
            <div>
              <button
                type="button"
                onClick={() => onToggleMenu(slot.slotNumber)}
                className="flex items-center gap-0.5 text-[0.6rem] font-medium text-ink-dim hover:text-ink border border-rule px-1.5 py-0.5 rounded bg-background"
                title="Ampliar o fusionar espacio para este cliente"
              >
                <Maximize2 className="h-2.5 w-2.5 text-live" />
                <span>Modificar</span>
                <ChevronDown className="h-2.5 w-2.5" />
              </button>

              {menuOpen && (
                <div className="absolute left-0 bottom-full mb-1 z-30 w-44 bg-card border border-border shadow-xl p-1 text-xs">
                  <div className="text-[0.62rem] font-bold text-muted-foreground px-2 py-1 uppercase border-b border-border">
                    Formato del Anuncio
                  </div>
                  {canMergeMed && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMerge(slot.slotNumber, 'MEDIUM');
                      }}
                      className="w-full text-left px-2 py-1.5 hover:bg-secondary flex items-center justify-between text-[0.68rem] text-live font-bold cursor-pointer"
                    >
                      <span>Mediano (1×2)</span>
                      <span>$650</span>
                    </button>
                  )}
                  {canMergeLg && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMerge(slot.slotNumber, 'LARGE');
                      }}
                      className="w-full text-left px-2 py-1.5 hover:bg-secondary flex items-center justify-between text-[0.68rem] text-purple-600 font-bold cursor-pointer"
                    >
                      <span>Grande (2×2)</span>
                      <span>$1,200</span>
                    </button>
                  )}
                  {!canMergeMed && !canMergeLg && (
                    <div className="px-2 py-1.5 text-[0.62rem] text-muted-foreground">
                      Espacio adyacente ocupado o al límite del cuadrante.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSplit(slot.slotNumber);
              }}
              className="flex items-center gap-0.5 text-[0.6rem] font-bold text-ink-dim hover:text-due border border-rule px-1.5 py-0.5 rounded bg-background cursor-pointer"
              title="Dividir de vuelta en espacios individuales chicos ($350)"
            >
              <Minimize2 className="h-2.5 w-2.5 text-due" />
              <span>Dividir</span>
            </button>
          )}
        </div>

        {/* Status Dropdown */}
        <select
          value={slot.status}
          disabled={isPaid}
          onChange={(e) => onUpdateStatus(slot.slotNumber, e.target.value as SlotStatus)}
          className="bg-card text-foreground border border-border text-[0.63rem] font-semibold px-1 py-0.5 rounded focus:outline-none cursor-pointer"
        >
          <option value="VACANT">Vacante</option>
          <option value="PROSPECTING">Llamando</option>
          <option value="RESERVED">Reservado (72h)</option>
          <option value="PAID">Pagado (${slot.priceUsd})</option>
        </select>
      </div>
    </div>
  );
};

/* ========================================================================= */
/* USPS TECHNICAL ZONE COMPONENT (Strictly Row 4, Col 4 of Back Face)        */
/* ========================================================================= */
const UspsZoneCard: React.FC<{ coveredHouseholds: number; selectedRoutes: number }> = ({
  coveredHouseholds,
  selectedRoutes,
}) => {
  const { setNodeRef } = useDroppable({ id: USPS_DROP_ID });

  return (
    <div
      ref={setNodeRef}
      style={{ gridColumn: '4 / span 1', gridRow: '2 / span 1' }}
      className="border-2 border-dashed border-live/70 bg-live/5 p-2 flex flex-col justify-between min-h-[105px] select-none text-foreground"
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[0.6rem] font-black uppercase tracking-wider text-live font-mono">
            USPS EDDM Indicia
          </span>
          <span className="text-[0.55rem] font-mono text-muted-foreground">ÁREA POSTAL</span>
        </div>

        {/* Postal Indicia Stamp Box */}
        <div className="border border-border/80 p-1 text-center text-[0.52rem] font-mono uppercase bg-card leading-tight">
          <p className="font-bold">PRSRT STD</p>
          <p>ECRWSS</p>
          <p>U.S. POSTAGE PAID</p>
          <p>EDDM RETAIL</p>
        </div>
      </div>

      <div className="border border-dashed border-border/80 p-1 bg-card text-[0.55rem] font-mono mt-1">
        <p className="text-live font-bold">Residential Customer</p>
        {coveredHouseholds > 0 ? (
          <p className="text-clear font-black">
            {coveredHouseholds.toLocaleString('en-US')} hogares ({selectedRoutes} rutas)
          </p>
        ) : (
          <p className="text-muted-foreground">Carrier Route Presort</p>
        )}
      </div>

      <p className="text-[0.5rem] text-muted-foreground italic pt-0.5 border-t border-live/30">
        Espacio técnico reservado por ley federal USPS. No se vende.
      </p>
    </div>
  );
};
