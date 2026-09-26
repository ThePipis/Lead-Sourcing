import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Clock,
  Eye,
  CheckCheck,
  Building2,
  Loader2,
  Lock,
  Unlock,
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
  Trash2,
  X,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  closestCenter,
  pointerWithin,
  CollisionDetection,
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
  getSlotReservationInfo,
  getSlotListPrice,
  getSlotDiscountedPrice,
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
  onSplitSlot?: (slotNumber: number, targetFormat?: 'SMALL' | 'MEDIUM') => void;
  onReleaseReservation?: (slotNumber: number) => void;
  onReactivateOffer?: (slotNumber: number) => void;
  onResetLayout?: (wipe: boolean) => void;
  coveredHouseholds?: number;
  selectedRoutes?: number;
  onAutofill?: () => void;
  onMarkAllPaid?: () => void;
  onUndoPayment?: (slotNumber: number, targetStatus?: SlotStatus, clearBusiness?: boolean) => void;
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
  onReactivateOffer,
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
  const [unlockTargetSlot, setUnlockTargetSlot] = useState<SlotState | null>(null);
  const [, setTimerTick] = useState(0);

  // Close unlock modal on Escape key
  useEffect(() => {
    if (!unlockTargetSlot) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUnlockTargetSlot(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [unlockTargetSlot]);

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

  const smallPrice = slots.find((s) => s.format === 'SMALL' && s.priceUsd && s.slotNumber !== 32 && s.status !== 'RESERVED')?.priceUsd || MODULAR_PRICES.SMALL;
  const mediumPrice = slots.find((s) => s.format === 'MEDIUM' && s.priceUsd && s.status !== 'RESERVED')?.priceUsd || MODULAR_PRICES.MEDIUM;
  const largePrice = slots.find((s) => s.format === 'LARGE' && s.priceUsd && s.status !== 'RESERVED')?.priceUsd || MODULAR_PRICES.LARGE;

  // Split slots into Front & Back and filter out slots covered by merged parents
  const visibleSlots = slots.filter((s) => {
    if (s.notes?.startsWith('Covered by')) return false;
    return true;
  });

  const isFront = (s: SlotState) => s.side === 'FRONT' || (s.slotNumber <= 16 && s.side !== 'BACK');

  const frontSlots = visibleSlots.filter(isFront);
  const backSlots = visibleSlots.filter((s) => !isFront(s));

  const sortByGridPosition = (a: SlotState, b: SlotState) => {
    return (a.displayNumber ?? a.slotNumber) - (b.displayNumber ?? b.slotNumber);
  };

  const frontTop = frontSlots.filter((s) => (s.gridRow ?? 1) <= 2).sort(sortByGridPosition);
  const frontBottom = frontSlots.filter((s) => (s.gridRow ?? 1) >= 3).sort(sortByGridPosition);

  const backTop = backSlots.filter((s) => (s.gridRow ?? 1) <= 2).sort(sortByGridPosition);
  const backBottom = backSlots.filter((s) => (s.gridRow ?? 1) >= 3).sort(sortByGridPosition);

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

  const handleSplit = (slotNumber: number, targetFormat: 'SMALL' | 'MEDIUM' = 'SMALL') => {
    setFormatMenuSlot(null);
    if (onSplitSlot) {
      onSplitSlot(slotNumber, targetFormat);
    } else {
      const updated = splitModularSlot(slotNumber, slots, targetFormat);
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
                Cara Frontal ({frontSlots.length} Espacios)
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
                Cara Reversa ({backSlots.filter((s) => s.format !== 'USPS').length} Espacios + USPS)
              </button>
            </div>

            <div className="hidden lg:flex items-center gap-2 text-[0.69rem] font-mono text-muted-foreground border-l border-border pl-3">
              <span className="font-semibold text-foreground">Postcard Jumbo 12" × 9"</span>
              <span>· Formato Modular Dinámico</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isDemo && onAutofill && (
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

            {isDemo && onResetLayout && (
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
                <span>🟩 Chico: ${smallPrice} (1×1)</span>
                <span>🟦 Mediano: ${mediumPrice} (1×2)</span>
                <span>🟪 Grande: ${largePrice.toLocaleString('en-US')} (2×2)</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Clic en un espacio para llamar o editar</span>
            </div>
          </div>

          {/* Custom Collision Detection: prioritizes pointer hover, falls back to closest center */}
          <DndContext
            sensors={sensors}
            collisionDetection={(args) => {
              const pointerCollisions = pointerWithin(args);
              if (pointerCollisions.length > 0) return pointerCollisions;
              return closestCenter(args);
            }}
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
                        isDemo={isDemo}
                        isSelected={selectedSlot === slot.slotNumber}
                        onInspect={onInspectSlot}
                        onMerge={handleMerge}
                        onSplit={handleSplit}
                        onRelease={handleRelease}
                        onReactivateOffer={onReactivateOffer}
                        onUpdateStatus={onUpdateSlotStatus}
                        onUndoPayment={onUndoPayment}
                        onPromptUnlock={(s) => setUnlockTargetSlot(s)}
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
                        isDemo={isDemo}
                        isSelected={selectedSlot === slot.slotNumber}
                        onInspect={onInspectSlot}
                        onMerge={handleMerge}
                        onSplit={handleSplit}
                        onRelease={handleRelease}
                        onReactivateOffer={onReactivateOffer}
                        onUpdateStatus={onUpdateSlotStatus}
                        onUndoPayment={onUndoPayment}
                        onPromptUnlock={(s) => setUnlockTargetSlot(s)}
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
                        isDemo={isDemo}
                        isSelected={selectedSlot === slot.slotNumber}
                        onInspect={onInspectSlot}
                        onMerge={handleMerge}
                        onSplit={handleSplit}
                        onRelease={handleRelease}
                        onReactivateOffer={onReactivateOffer}
                        onUpdateStatus={onUpdateSlotStatus}
                        onUndoPayment={onUndoPayment}
                        onPromptUnlock={(s) => setUnlockTargetSlot(s)}
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
                          isDemo={isDemo}
                          isSelected={selectedSlot === slot.slotNumber}
                          onInspect={onInspectSlot}
                          onMerge={handleMerge}
                          onSplit={handleSplit}
                          onRelease={handleRelease}
                          onReactivateOffer={onReactivateOffer}
                          onUpdateStatus={onUpdateSlotStatus}
                          onUndoPayment={onUndoPayment}
                          onPromptUnlock={(s) => setUnlockTargetSlot(s)}
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
                    ESPACIO #{slots.find((s) => s.slotNumber === draggingSlot)?.displayNumber ?? draggingSlot}
                  </p>
                  <p className="text-xs font-bold text-foreground">
                    {slots.find((s) => s.slotNumber === draggingSlot)?.businessName || 'Comercio Local'}
                  </p>
                </div>
              )}
            </DragOverlay>

            {/* Global Unlock / Rollback Modal */}
            {unlockTargetSlot && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
                onClick={() => setUnlockTargetSlot(null)}
              >
                <div
                  className="w-full max-w-md bg-card border-2 border-due shadow-2xl rounded-lg p-5 flex flex-col space-y-4 animate-in zoom-in-95 duration-150"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="unlock-modal-title"
                >
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-md bg-due/15 text-due">
                        <Unlock className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 id="unlock-modal-title" className="text-sm font-black text-foreground">
                          Desbloquear Espacio #{unlockTargetSlot.displayNumber ?? unlockTargetSlot.slotNumber}
                        </h3>
                        <p className="text-[0.68rem] text-muted-foreground mt-0.5">
                          {unlockTargetSlot.businessName || unlockTargetSlot.categoryName || 'Comercio Local'} · Pagado (${unlockTargetSlot.priceUsd})
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUnlockTargetSlot(null)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                      title="Cerrar modal"
                      aria-label="Cerrar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    ¿Qué deseas hacer con este espacio actualmente registrado como pagado?
                  </p>

                  <div className="space-y-3">
                    {/* Option 1: Desbloquear cobro (Pasar a Reservado) */}
                    <button
                      type="button"
                      onClick={() => {
                        const num = unlockTargetSlot.slotNumber;
                        setUnlockTargetSlot(null);
                        onUndoPayment?.(num, 'RESERVED', false);
                      }}
                      className="w-full text-left p-3.5 rounded-lg border-2 border-live/40 bg-live/5 hover:bg-live/15 hover:border-live transition-all cursor-pointer group flex items-start gap-3"
                    >
                      <div className="mt-0.5 p-2 rounded-full bg-live/20 text-live shrink-0 group-hover:scale-105 transition-transform">
                        <Unlock className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-live flex items-center justify-between">
                          <span>Desbloquear cobro (Pasar a Reservado)</span>
                          <span className="text-[0.62rem] font-bold uppercase tracking-wider text-live/80 bg-live/10 px-1.5 py-0.5 rounded border border-live/30">Seguro</span>
                        </div>
                        <div className="text-[0.72rem] text-muted-foreground leading-snug mt-1 group-hover:text-foreground">
                          Conserva al anunciante y sus datos en la casilla. Anula el registro de pago para permitir editar el nombre, titular o renegociar las condiciones comerciales.
                        </div>
                      </div>
                    </button>

                    {/* Option 2: Dar de baja total (Rollback a Vacante) */}
                    <button
                      type="button"
                      onClick={() => {
                        const num = unlockTargetSlot.slotNumber;
                        setUnlockTargetSlot(null);
                        onUndoPayment?.(num, 'VACANT', true);
                      }}
                      className="w-full text-left p-3.5 rounded-lg border-2 border-due/40 bg-due/5 hover:bg-due/15 hover:border-due transition-all cursor-pointer group flex items-start gap-3"
                    >
                      <div className="mt-0.5 p-2 rounded-full bg-due/20 text-due shrink-0 group-hover:scale-105 transition-transform">
                        <RotateCcw className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-due flex items-center justify-between">
                          <span>Dar de baja total (Rollback a Vacante)</span>
                          <span className="text-[0.62rem] font-bold uppercase tracking-wider text-due/80 bg-due/10 px-1.5 py-0.5 rounded border border-due/30">Desvincular</span>
                        </div>
                        <div className="text-[0.72rem] text-muted-foreground leading-snug mt-1 group-hover:text-foreground">
                          El cliente desistió: anula el pago y borra al anunciante de la base de datos, dejando la casilla completamente vacante y disponible para prospectar a otro negocio.
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-border flex justify-end">
                    <button
                      type="button"
                      onClick={() => setUnlockTargetSlot(null)}
                      className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md bg-secondary/60 hover:bg-secondary transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}
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
  isDemo?: boolean;
  onInspect?: (slotNumber: number) => void;
  onMerge: (slotNumber: number, format: 'MEDIUM' | 'LARGE') => void;
  onSplit: (slotNumber: number, targetFormat?: 'SMALL' | 'MEDIUM') => void;
  onRelease: (slotNumber: number) => void;
  onReactivateOffer?: (slotNumber: number) => void;
  onUpdateStatus: (slotNumber: number, status: SlotStatus) => void;
  onUndoPayment?: (slotNumber: number, targetStatus?: SlotStatus, clearBusiness?: boolean) => void;
  onPromptUnlock?: (slot: SlotState) => void;
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
  isDemo = false,
  onInspect,
  onMerge,
  onSplit,
  onRelease,
  onReactivateOffer,
  onUpdateStatus,
  onUndoPayment,
  onPromptUnlock,
  busy,
  onNextCandidate,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  blockRowOffset,
}) => {
  const { t } = useTranslation(['canvas', 'common']);
  const isPaid = slot.status === 'PAID';
  const isReserved = slot.status === 'RESERVED';
  const isProspecting = slot.status === 'PROSPECTING';
  const isVacant = slot.status === 'VACANT';
  const isExpired = isReservationExpired(slot);
  const hasBusiness = Boolean(slot.businessName && slot.businessName.trim().length > 0);
  const canMarkPaid = isDemo || hasBusiness;
  const showVacantBadge = !isDemo && (isVacant || !hasBusiness);

  const format: SlotFormat =
    slot.format ||
    ((slot.rowSpan === 2 && slot.colSpan === 2)
      ? 'LARGE'
      : slot.rowSpan === 2
      ? 'MEDIUM'
      : 'SMALL');

  const colSpan = slot.colSpan || (format === 'LARGE' ? 2 : 1);
  const rowSpan = slot.rowSpan || (format === 'LARGE' || format === 'MEDIUM' ? 2 : 1);

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
    ? 'border-live border-l-4 border-l-live bg-slot-bg'
    : 'border-dashed border-border border-l-4 border-l-muted-foreground/40 bg-slot-bg hover:border-live/60 hover:bg-secondary/60';

  const activeSmallPrice = allSlots?.find((s) => s.format === 'SMALL' && s.priceUsd && s.slotNumber !== 32 && s.status !== 'RESERVED')?.priceUsd || MODULAR_PRICES.SMALL;
  const activeMedPrice = allSlots?.find((s) => s.format === 'MEDIUM' && s.priceUsd && s.status !== 'RESERVED')?.priceUsd || MODULAR_PRICES.MEDIUM;
  const activeLgPrice = allSlots?.find((s) => s.format === 'LARGE' && s.priceUsd && s.status !== 'RESERVED')?.priceUsd || MODULAR_PRICES.LARGE;
  const resInfo = getSlotReservationInfo(slot);

  const formatBadge = {
    SMALL: { label: 'Chico (1×1)', color: 'bg-secondary text-ink-dim', price: activeSmallPrice },
    MEDIUM: { label: 'Mediano (1×2)', color: 'bg-live/15 text-live font-bold', price: activeMedPrice },
    LARGE: { label: 'Grande (2×2)', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 font-black', price: activeLgPrice },
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
      className={`relative flex flex-col justify-between p-2.5 sm:p-3 border transition-all cursor-pointer select-none bg-slot-bg ${
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
              #{slot.displayNumber ?? slot.slotNumber}
            </span>
            <span className={`text-[0.58rem] px-1 py-0.2 rounded border border-rule/50 ${formatBadge.color}`}>
              {formatBadge.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {isReserved ? (
              <div
                className="flex items-baseline gap-1 font-mono"
                title={`Precio de lista: $${resInfo.listPrice} · Tarifa con descuento: $${resInfo.discountedPrice} (-$${resInfo.discountUsd})`}
              >
                <span className="text-[0.62rem] text-muted-foreground line-through font-semibold">
                  ${resInfo.listPrice}
                </span>
                <span className={`text-xs font-black ${isExpired ? 'text-due' : 'text-amber-600 dark:text-amber-400'}`}>
                  ${slot.priceUsd || resInfo.discountedPrice}
                </span>
                <span className={`text-[0.55rem] font-bold px-1 py-0.2 rounded border ${
                  isExpired
                    ? 'bg-due/15 text-due border-due/30'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                }`}>
                  {isExpired ? 'EXPIRADA' : `${resInfo.percentOff}% OFF`}
                </span>
              </div>
            ) : (
              <span className="font-mono text-xs font-black text-foreground">
                ${slot.priceUsd || formatBadge.price}
              </span>
            )}

            {/* Drag Handle */}
            {!isPaid && (
              <button
                type="button"
                {...attributes}
                {...listeners}
                className="text-muted-foreground hover:text-foreground p-1.5 -mr-1 rounded hover:bg-secondary cursor-grab active:cursor-grabbing touch-none flex items-center transition-colors"
                title="Arrastrar para intercambiar posición"
              >
                <GripVertical className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* 72h Reservation Timer Badge */}
        {isReserved && (
          <div className="mb-1.5" onClick={(e) => e.stopPropagation()}>
            <div
              className={`flex items-center justify-between px-1.5 py-0.5 rounded text-[0.6rem] font-bold border ${
                isExpired
                  ? 'bg-due/15 border-due/50 text-due'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
              }`}
            >
              <span className="flex items-center gap-1 truncate">
                <Clock className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {isExpired ? '🚨 72h VENCIDA' : `⏳ ${formatReservationCountdown(slot)}`}
                </span>
                {!isExpired && (
                  <span className="text-[0.55rem] font-semibold opacity-90 shrink-0">
                    (-${resInfo.discountUsd})
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1 shrink-0 ml-1">
                {isExpired && onReactivateOffer && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReactivateOffer(slot.slotNumber);
                    }}
                    className="text-[0.58rem] bg-live/20 hover:bg-live/30 text-live border border-live/40 px-1.5 py-0.2 rounded font-black cursor-pointer transition-colors"
                    title={`Reactivar oferta de $${resInfo.discountedPrice} y renovar 72 horas`}
                  >
                    🔄 Reactivar (-${resInfo.discountUsd})
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRelease(slot.slotNumber);
                  }}
                  className="text-[0.58rem] underline hover:text-foreground font-semibold cursor-pointer text-muted-foreground"
                  title="Liberar slot y restaurar a vacante"
                >
                  Liberar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Paid Status & Quick Unlock Action */}
        {isPaid && (
          <div className="mb-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-1.5 py-0.5 rounded text-[0.6rem] font-bold border bg-clear/15 border-clear/40 text-clear">
              <span className="flex items-center gap-1 truncate">
                <Lock className="h-3 w-3 shrink-0" />
                <span className="truncate">PAGADO {slot.paymentRef ? `· ${slot.paymentRef}` : ''}</span>
              </span>
              <button
                type="button"
                onClick={() => (onPromptUnlock ? onPromptUnlock(slot) : onUndoPayment?.(slot.slotNumber, 'RESERVED', false))}
                className="ml-1 text-[0.58rem] shrink-0 flex items-center gap-0.5 font-black text-due hover:underline hover:text-due-dark bg-due/10 border border-due/30 px-1.5 py-0.2 rounded cursor-pointer transition-colors"
                title="Desbloquear este slot o hacer rollback si el cliente canceló"
              >
                <Unlock className="h-2.5 w-2.5" />
                Desbloquear
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
                className="flex items-center gap-0.5 text-[0.6rem] font-medium text-ink-dim hover:text-ink border border-rule px-1.5 py-0.5 rounded bg-secondary hover:bg-accent cursor-pointer transition-colors"
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
                      <span>${activeMedPrice}</span>
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
                      <span>${activeLgPrice.toLocaleString('en-US')}</span>
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
          ) : format === 'MEDIUM' ? (
            <div>
              <button
                type="button"
                onClick={() => onToggleMenu(slot.slotNumber)}
                className="flex items-center gap-0.5 text-[0.6rem] font-medium text-ink-dim hover:text-ink border border-rule px-1.5 py-0.5 rounded bg-secondary hover:bg-accent cursor-pointer transition-colors"
                title="Ampliar a Grande o Dividir"
              >
                <Maximize2 className="h-2.5 w-2.5 text-purple-600" />
                <span>Modificar</span>
                <ChevronDown className="h-2.5 w-2.5" />
              </button>

              {menuOpen && (
                <div className="absolute left-0 bottom-full mb-1 z-30 w-48 bg-card border border-border shadow-xl p-1 text-xs">
                  <div className="text-[0.62rem] font-bold text-muted-foreground px-2 py-1 uppercase border-b border-border">
                    Formato del Anuncio
                  </div>
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
                      <span>${activeLgPrice.toLocaleString('en-US')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSplit(slot.slotNumber);
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-secondary flex items-center justify-between text-[0.68rem] text-due font-bold cursor-pointer border-t border-border mt-0.5"
                  >
                    <span>Dividir en Chicos (1×1)</span>
                    <span>${activeSmallPrice}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => onToggleMenu(slot.slotNumber)}
                className="flex items-center gap-0.5 text-[0.6rem] font-medium text-ink-dim hover:text-ink border border-rule px-1.5 py-0.5 rounded bg-secondary hover:bg-accent cursor-pointer transition-colors"
                title="Dividir en Medianos o Chicos"
              >
                <Minimize2 className="h-2.5 w-2.5 text-due" />
                <span>Modificar</span>
                <ChevronDown className="h-2.5 w-2.5" />
              </button>

              {menuOpen && (
                <div className="absolute left-0 bottom-full mb-1 z-30 w-52 bg-card border border-border shadow-xl p-1 text-xs">
                  <div className="text-[0.62rem] font-bold text-muted-foreground px-2 py-1 uppercase border-b border-border">
                    Dividir Espacio Grande
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSplit(slot.slotNumber, 'MEDIUM');
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-secondary flex items-center justify-between text-[0.68rem] text-live font-bold cursor-pointer"
                  >
                    <span>Medianos (1×2)</span>
                    <span>${activeMedPrice.toLocaleString('en-US')} c/u</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSplit(slot.slotNumber, 'SMALL');
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-secondary flex items-center justify-between text-[0.68rem] text-due font-bold cursor-pointer border-t border-border mt-0.5"
                  >
                    <span>Dividir en Chicos (1×1)</span>
                    <span>${activeSmallPrice.toLocaleString('en-US')} c/u</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status Dropdown / Vacant Badge */}
        {showVacantBadge ? (
          <span
            onClick={() => onInspect?.(slot.slotNumber)}
            className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[0.63rem] font-bold tracking-wide border border-clear/50 bg-clear/15 text-clear select-none shadow-2xs cursor-pointer hover:bg-clear/25 hover:border-clear/70 transition-colors"
            title={t('canvas:status.vacantTooltip', 'Espacio vacante disponible · Clic para prospectar o asignar cliente')}
          >
            {t('canvas:status.vacant', 'Vacante')}
          </span>
        ) : (
          <select
            value={slot.status}
            disabled={isPaid}
            onChange={(e) => {
              const next = e.target.value as SlotStatus;
              if (isPaid && next !== 'PAID') {
                if (next === 'VACANT') {
                  onUndoPayment?.(slot.slotNumber, 'VACANT', true);
                } else {
                  onUndoPayment?.(slot.slotNumber, next, false);
                }
              } else {
                onUpdateStatus(slot.slotNumber, next);
              }
            }}
            className={`bg-secondary text-foreground border border-border text-[0.63rem] font-semibold px-1 py-0.5 rounded focus:outline-none transition-all ${
              isPaid ? 'opacity-60 cursor-not-allowed bg-muted/40' : 'cursor-pointer hover:border-foreground/40'
            }`}
            title={isPaid ? t('canvas:status.paidLockedTooltip', 'Slot pagado (usa el botón "Desbloquear" para modificar)') : t('canvas:status.changeStatusTooltip', 'Cambiar estado')}
          >
            {isPaid ? (
              <option value="PAID">{t('canvas:status.paid', 'Pagado')}</option>
            ) : isReserved ? (
              <>
                <option value="RESERVED">{t('canvas:status.reserved', 'Reservado (72h)')}</option>
                {canMarkPaid && <option value="PAID">{t('canvas:status.paid', 'Pagado')}</option>}
              </>
            ) : (
              <>
                <option value="VACANT">{t('canvas:status.vacant', 'Vacante')}</option>
                <option value="PROSPECTING">{t('canvas:status.calling', 'Llamando')}</option>
                <option value="RESERVED">{t('canvas:status.reserved', 'Reservado (72h)')}</option>
                {canMarkPaid && <option value="PAID">{t('canvas:status.paid', 'Pagado')}</option>}
              </>
            )}
          </select>
        )}
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
