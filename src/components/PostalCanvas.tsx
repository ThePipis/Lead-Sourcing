import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Clock,
  Users,
  Unlock,
  Lock,
  Eye,
  CheckCheck,
  Building2,
  Loader2,
  GripVertical,
  RotateCcw,
  Sparkles,
  Phone,
  RefreshCw,
  MapPin,
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
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { CLOSED_CATEGORIES, USPS_TECHNICAL_SLOT } from '../data/categories.ts';
import { SlotState, SlotStatus, CardSide, CategoryDefinition } from '../types.ts';

/**
 * A box on the card: draggable and a drop target at once.
 *
 * The fourteen boxes are physical positions on a printed sheet, so dropping one
 * onto another swaps their contents — nothing reflows, nothing reorders. That is
 * why this does not use @dnd-kit/sortable: a sorting strategy would shove the
 * other boxes aside mid-drag and then put them back on drop, which is exactly
 * the jitter this replaces. The card stays put, a ghost follows the pointer, and
 * the box under it lights up.
 *
 * Every box uses this, the hero and the back panel included. The only position
 * that is not registered at all is the USPS technical zone: the indicia, the
 * route line and the barcode are postal requirements, not inventory.
 */
const USPS_DROP_ID = 'usps-technical-zone';

/**
 * How a box looks in each of the four states of a sale.
 *
 * The state has to be readable from across the card, without reading a badge:
 * a left edge four pixels wide carries the colour, the fill carries a tint of
 * it. The colours are the ledger's own — amber is a conversation in progress,
 * red is money owed, green is money in. An empty box has no colour and a broken
 * border, because there is nothing to owe yet.
 */
function statusSkin(status: SlotStatus): string {
  switch (status) {
    case 'PAID':
      return 'border-clear border-l-4 border-l-clear bg-clear/10 hover:bg-clear/15';
    case 'RESERVED':
      return 'border-due/60 border-l-4 border-l-due bg-due/10 hover:border-due';
    case 'PROSPECTING':
      return 'border-live/60 border-l-4 border-l-live bg-live/10 hover:border-live';
    default:
      return 'border-dashed border-border border-l-4 border-l-rule-strong bg-muted/40 hover:border-muted-foreground/40';
  }
}

function useSlotDrag(id: number, locked = false) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id,
    // A sold box does not move: the advertiser bought that position, at that
    // size, for that price.
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
    // Only light up a target while another box is the one travelling.
    isOver: isOver && Number(active?.id) !== id,
  };
}

/**
 * The USPS technical zone. It is registered as a drop target for one reason: so
 * a box dropped on top of it lands here and goes nowhere, instead of snapping to
 * whichever box happens to be nearest. The indicia, the route line and the
 * barcode are postal requirements and never trade places with an advertiser.
 */
const UspsZone: React.FC<{ children: React.ReactNode; refuseLabel: string }> = ({
  children,
  refuseLabel,
}) => {
  const { setNodeRef, isOver, active } = useDroppable({ id: USPS_DROP_ID });
  const refusing = isOver && active !== null;
  return (
    <div
      ref={setNodeRef}
      aria-label={refuseLabel}
      className={`col-span-1 flex flex-col justify-between min-h-[140px] border border-dashed p-3 text-foreground transition-colors sm:col-span-1 lg:col-span-1 ${
        refusing ? 'border-due bg-due/10' : 'border-live/60 bg-live/10'
      }`}
    >
      {children}
      {refusing && (
        <p className="mt-1 border-t border-due/40 pt-1 text-[0.56rem] font-bold text-due uppercase">
          {refuseLabel}
        </p>
      )}
    </div>
  );
};

/** Shared grip. Dragging is opt-in via the handle so the card stays clickable. */
const DragGrip: React.FC<{
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  label: string;
  title: string;
  /** A sold box does not move: the position is part of what was paid for. */
  locked?: boolean;
  lockedTitle?: string;
}> = ({ attributes, listeners, label, title, locked = false, lockedTitle }) =>
  locked ? (
    <span
      className="-m-1 border border-transparent p-1 text-clear"
      title={lockedTitle ?? title}
      aria-label={lockedTitle ?? title}
    >
      <Lock className="h-4 w-4" />
    </span>
  ) : (
    <button
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      className="cursor-drag -m-1 border border-transparent p-1 text-ink-dim transition-colors touch-none hover:border-rule hover:bg-secondary hover:text-ink"
      title={title}
      aria-label={label}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

interface PostalCanvasProps {
  slots: SlotState[];
  onUpdateSlotStatus: (slotNumber: number, newStatus: SlotStatus) => void;
  onUpdateSlotBusiness: (slotNumber: number, businessName: string, headline?: string) => void;
  onUpdateSlotPrice?: (slotNumber: number, newPrice: number) => void;
  onUpdateSlotAvgTicket?: (slotNumber: number, newAvgTicket: number) => void;
  onSwapSlots?: (sourceSlotNumber: number, targetSlotNumber: number) => void;
  /**
   * Restores the factory arrangement of the fourteen niches. With `wipe`, also
   * empties every box: a blank card, as on day one. Practice file only.
   */
  onResetLayout?: (wipe: boolean) => void;
  /** Households the selected carrier routes actually cover, if the engine ran. */
  coveredHouseholds?: number;
  selectedRoutes?: number;
  /** Fills every empty box with a real business to call. */
  onAutofill?: () => void;
  /** Practice-file shortcut: stamp every unpaid box as collected. */
  onMarkAllPaid?: () => void;
  /** Reverts a payment recorded by mistake; the box goes back to RESERVED. */
  onUndoPayment?: (slotNumber: number) => void;
  isDemo?: boolean;
  /** A box was clicked: the page opens it in the inspector. */
  onInspectSlot?: (slotNumber: number) => void;
  /** The box the inspector is showing, if any. The card follows it. */
  selectedSlot?: number | null;
  /** They said no: bring the next candidate for this box. */
  onNextCandidate?: (slotNumber: number) => void;
  isFilling?: boolean;
  busySlot?: number | null;
  fillReport?: {
    filled: { slot: number; business: string; phone: string; alternatives: number }[];
    skipped: { slot: number; reason: string }[];
  } | null;
  onQuickSimulateAllPaid?: () => void;
  onExecuteCuration?: () => void;
  onSourceLeadForSlot?: (slotNumber: number) => void;
  onClearSlot?: (slotNumber: number) => void;
  isSaving?: boolean;
  isLoading?: boolean;
  /** Estado de apertura del panel lateral flotante del inspector */
  inspectorOpen?: boolean;
  /** Callback para cerrar el inspector */
  onCloseInspector?: () => void;
  /** Nodo del inspector de slot a renderizar dentro del panel flotante */
  inspectorNode?: React.ReactNode;
}

interface SortableSlotCardProps {
  slot: SlotState;
  onNextCandidate?: (slotNumber: number) => void;
  busySlot?: number | null;
  catDef: CategoryDefinition;
  onOpenEdit: (slotNumber: number) => void;
  onUpdateStatus: (slotNumber: number, status: SlotStatus) => void;
  onUpdatePrice?: (slotNumber: number, price: number) => void;
  onUpdateAvgTicket?: (slotNumber: number, ticket: number) => void;
  getStatusBadge: (status: SlotStatus) => React.ReactNode;
  /** This is the box the inspector is showing. */
  isSelected?: boolean;
}

const SortableSlotCard: React.FC<SortableSlotCardProps> = ({
  slot,
  onNextCandidate,
  busySlot = null,
  catDef,
  onOpenEdit,
  onUpdateStatus,
  onUpdatePrice,
  onUpdateAvgTicket,
  getStatusBadge,
  isSelected = false,
}) => {
  const { t } = useTranslation(['canvas', 'common']);
  const { attributes, listeners, setNodeRef, isDragging, isOver } = useSlotDrag(
    slot.slotNumber,
    slot.status === 'PAID',
  );

  const [localPrice, setLocalPrice] = useState<number>(slot.priceUsd);
  const [localTicket, setLocalTicket] = useState<number>(slot.avgTicketUsd ?? catDef.avgTicketUsd);

  useEffect(() => {
    setLocalPrice(slot.priceUsd);
  }, [slot.priceUsd]);

  useEffect(() => {
    setLocalTicket(slot.avgTicketUsd ?? catDef.avgTicketUsd);
  }, [slot.avgTicketUsd, catDef.avgTicketUsd]);

  const handleCommitPrice = () => {
    const num = Number(localPrice);
    if (!isNaN(num) && num > 0 && num !== slot.priceUsd && onUpdatePrice) {
      onUpdatePrice(slot.slotNumber, num);
    } else {
      setLocalPrice(slot.priceUsd);
    }
  };

  const handleCommitTicket = () => {
    const num = Number(localTicket);
    const currentTicket = slot.avgTicketUsd ?? catDef.avgTicketUsd;
    if (!isNaN(num) && num > 0 && num !== currentTicket && onUpdateAvgTicket) {
      onUpdateAvgTicket(slot.slotNumber, num);
    } else {
      setLocalTicket(currentTicket);
    }
  };

  const getCardStyle = () => {
    if (isOver) return 'ring-2 ring-primary border-primary bg-primary/10';
    if (isDragging) return 'border-dashed border-primary/60 bg-primary/5 opacity-40';
    return `${statusSkin(slot.status)}${isSelected ? ' ring-2 ring-live ring-offset-0' : ''}`;
  };

  const isVacant = slot.status === 'VACANT';
  const isPaid = slot.status === 'PAID';
  // The box gives the size and the price; the slot's own category gives the
  // niche. They differ the moment an advertiser is dragged to another position,
  // and the niche is what has to travel with them.
  const niche = CLOSED_CATEGORIES.find((c) => c.id === slot.categoryId) ?? catDef;
  const categoryName = t(`common:categories.${niche.id}.name`, niche.name);
  const defaultHeadline = t(`common:categories.${niche.id}.headline`, niche.defaultHeadline);

  return (
    <div
      ref={setNodeRef}
      className={`relative border transition-colors p-3 flex flex-col justify-between min-h-[140px] cursor-pointer select-none group ${getCardStyle()}`}
      onClick={() => onOpenEdit(catDef.id)}
    >
      <div>
        {/* Top meta row: Drag handle + Slot tag + Editable Ad Price */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center space-x-1.5">
            <DragGrip
              attributes={attributes}
              listeners={listeners}
              title={t('canvas:ruler.dragTitle')}
              label={t('canvas:ruler.dragAria', { id: catDef.id })}
              locked={isPaid}
              lockedTitle={t('canvas:slots.paidLocked')}
            />
            <span
              className={`text-[0.63rem] font-mono font-bold ${isVacant ? 'text-muted-foreground' : 'text-muted-foreground'}`}
            >
              SLOT {catDef.id} • {catDef.widthInches}" × {catDef.heightInches}"
            </span>
          </div>

          {/* Editable Ad Price Pill */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center space-x-0.5 bg-card px-1.5 py-0.5 border border-border  hover:border-live transition-colors"
            title={t('canvas:slots.priceEditTitle')}
          >
            <span className="text-xs font-mono font-bold text-secondary-foreground">$</span>
            <input
              type="number"
              aria-label={t('canvas:slots.priceAria', { id: catDef.id })}
              value={localPrice}
              readOnly={isPaid}
              title={isPaid ? t('canvas:slots.paidLocked') : t('canvas:slots.priceEditTitle')}
              onChange={(e) => setLocalPrice(Number(e.target.value))}
              onBlur={handleCommitPrice}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCommitPrice();
                  e.currentTarget.blur();
                }
              }}
              className="w-12 bg-transparent text-xs font-mono font-bold text-foreground text-right focus:outline-none focus:ring-1 focus:ring-live px-0.5 cursor-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-[0.63rem] font-mono text-muted-foreground">USD</span>
          </div>
        </div>

        {/* Business Name & Status Badge */}
        <div className="flex items-center justify-between mb-1">
          <h4
            className={`text-xs font-bold line-clamp-1 ${
              isVacant && !slot.businessName ? 'text-muted-foreground italic' : 'text-foreground'
            }`}
          >
            {slot.businessName ||
              (isVacant ? t('canvas:slots.vacantPrefix', { name: categoryName }) : categoryName)}
          </h4>
          {getStatusBadge(slot.status)}
        </div>

        {/* Offer Headline */}
        <p
          className={`text-[0.69rem] line-clamp-2 mt-1 leading-snug ${
            isVacant ? 'text-muted-foreground italic' : 'text-muted-foreground'
          }`}
        >
          {slot.offerHeadline || defaultHeadline}
        </p>

        <ContactStrip
          slot={slot}
          busy={busySlot === slot.slotNumber}
          onNextCandidate={onNextCandidate}
        />
      </div>

      {/* Bottom controls: Editable Avg Ticket + Status Select */}
      <div className="pt-2 border-t border-border flex items-center justify-between mt-2">
        {/* Editable Average Customer Ticket */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center space-x-1 text-[0.63rem] font-mono text-muted-foreground"
          title={t('canvas:slots.ticketEditTitle')}
        >
          <span>{t('canvas:slots.ticket')}</span>
          <input
            type="number"
            aria-label={t('canvas:slots.ticketAria', { id: catDef.id })}
            value={localTicket}
            readOnly={isPaid}
            onChange={(e) => setLocalTicket(Number(e.target.value))}
            onBlur={handleCommitTicket}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCommitTicket();
                e.currentTarget.blur();
              }
            }}
            className="w-14 bg-card text-foreground font-semibold px-1 py-0.5 border border-border text-right focus:outline-none focus:ring-1 focus:ring-live cursor-text  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        {/* Status Dropdown */}
        <select
          aria-label={t('canvas:slots.statusAria', { id: catDef.id })}
          value={slot.status}
          disabled={isPaid}
          title={isPaid ? t('canvas:slots.paidLocked') : undefined}
          onChange={(e) => {
            e.stopPropagation();
            onUpdateStatus(catDef.id, e.target.value as SlotStatus);
          }}
          className="bg-card text-foreground border border-border text-[0.69rem] px-1.5 py-0.5 font-medium focus:outline-none cursor-pointer hover:border-muted-foreground/40 "
          onClick={(e) => e.stopPropagation()}
        >
          <option value="VACANT">{t('common:status.vacant')}</option>
          <option value="PROSPECTING">{t('common:status.negotiating')}</option>
          <option value="RESERVED">{t('common:status.reserved')}</option>
          <option value="PAID">{t('common:status.paid', { price: slot.priceUsd })}</option>
        </select>
      </div>
    </div>
  );
};

/**
 * What the partner needs to work a box: the number to dial, and a way to say
 * "they turned us down, give me another one".
 *
 * It only appears once a business is in the box and disappears once the box is
 * paid: at that point the negotiation is over and swapping the advertiser would
 * erase a sale.
 */
const ContactStrip: React.FC<{
  slot: SlotState;
  busy: boolean;
  onNextCandidate?: (slotNumber: number) => void;
}> = ({ slot, busy, onNextCandidate }) => {
  const { t } = useTranslation(['canvas']);
  if (!slot.businessName || slot.status === 'PAID') return null;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      {slot.businessAddress && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            `${slot.businessName} ${slot.businessAddress}`,
          )}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[0.63rem] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
          title={t('canvas:slots.mapTitle')}
        >
          <MapPin className="h-3 w-3" />
          {slot.businessAddress}
        </a>
      )}

      {slot.phone ? (
        <a
          href={`tel:${slot.phone.replace(/[^+\d]/g, '')}`}
          className="flex items-center gap-1 font-mono text-[0.63rem] text-live transition-colors hover:text-foreground"
          title={t('canvas:slots.callTitle')}
        >
          <Phone className="h-3 w-3" />
          {slot.phone}
        </a>
      ) : (
        <span className="font-mono text-[0.63rem] text-muted-foreground">
          {t('canvas:slots.noPhone')}
        </span>
      )}

      {onNextCandidate && (
        <button
          type="button"
          onClick={() => onNextCandidate(slot.slotNumber)}
          disabled={busy}
          title={t('canvas:slots.nextCandidateTitle')}
          aria-label={`${t('canvas:slots.nextCandidate')} ${slot.slotNumber}`}
          className="flex items-center gap-1 border border-border px-1.5 py-0.5 text-[0.63rem] font-medium text-muted-foreground transition-colors hover:border-live hover:text-foreground disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {t('canvas:slots.nextCandidate')}
        </button>
      )}
    </div>
  );
};

interface HeroSlotCardProps {
  slot: SlotState;
  onNextCandidate?: (slotNumber: number) => void;
  busySlot?: number | null;
  catDef: CategoryDefinition;
  onOpenEdit: (slotNumber: number) => void;
  onUpdateStatus: (slotNumber: number, status: SlotStatus) => void;
  onUpdatePrice?: (slotNumber: number, price: number) => void;
  onUpdateAvgTicket?: (slotNumber: number, ticket: number) => void;
  getStatusBadge: (status: SlotStatus) => React.ReactNode;
  /** This is the box the inspector is showing. */
  isSelected?: boolean;
}

const HeroSlotCard: React.FC<HeroSlotCardProps> = ({
  slot,
  onNextCandidate,
  busySlot = null,
  catDef,
  onOpenEdit,
  onUpdateStatus,
  onUpdatePrice,
  onUpdateAvgTicket,
  getStatusBadge,
  isSelected = false,
}) => {
  const { t } = useTranslation(['canvas', 'common']);
  const { attributes, listeners, setNodeRef, isDragging, isOver } = useSlotDrag(
    slot.slotNumber,
    slot.status === 'PAID',
  );
  const [localPrice, setLocalPrice] = useState<number>(slot.priceUsd);
  const [localTicket, setLocalTicket] = useState<number>(slot.avgTicketUsd ?? catDef.avgTicketUsd);

  useEffect(() => {
    setLocalPrice(slot.priceUsd);
  }, [slot.priceUsd]);

  useEffect(() => {
    setLocalTicket(slot.avgTicketUsd ?? catDef.avgTicketUsd);
  }, [slot.avgTicketUsd, catDef.avgTicketUsd]);

  const handleCommitPrice = () => {
    const num = Number(localPrice);
    if (!isNaN(num) && num > 0 && num !== slot.priceUsd && onUpdatePrice) {
      onUpdatePrice(slot.slotNumber, num);
    } else {
      setLocalPrice(slot.priceUsd);
    }
  };

  const handleCommitTicket = () => {
    const num = Number(localTicket);
    const currentTicket = slot.avgTicketUsd ?? catDef.avgTicketUsd;
    if (!isNaN(num) && num > 0 && num !== currentTicket && onUpdateAvgTicket) {
      onUpdateAvgTicket(slot.slotNumber, num);
    } else {
      setLocalTicket(currentTicket);
    }
  };

  const isHeroVacant = slot.status === 'VACANT';
  const isPaid = slot.status === 'PAID';
  const heroStyle = `text-foreground ${statusSkin(slot.status)}${isSelected ? ' ring-2 ring-live' : ''}`;

  // The box gives the size and the price; the slot's own category gives the
  // niche. They differ the moment an advertiser is dragged to another position,
  // and the niche is what has to travel with them.
  const niche = CLOSED_CATEGORIES.find((c) => c.id === slot.categoryId) ?? catDef;
  const categoryName = t(`common:categories.${niche.id}.name`, niche.name);
  const defaultHeadline = t(`common:categories.${niche.id}.headline`, niche.defaultHeadline);

  const dragStyle = isOver
    ? 'ring-2 ring-primary border-primary bg-primary/10'
    : isDragging
      ? 'border-dashed border-primary/60 bg-primary/5 opacity-40'
      : heroStyle;

  return (
    <div
      key={1}
      ref={setNodeRef}
      className={`relative border transition-colors p-3.5 sm:p-4 flex flex-col justify-between min-h-[120px] cursor-pointer select-none ${dragStyle}`}
      onClick={() => onOpenEdit(1)}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <DragGrip
              attributes={attributes}
              listeners={listeners}
              title={t('canvas:ruler.dragTitle')}
              label={t('canvas:ruler.dragAria', { id: 1 })}
              locked={isPaid}
              lockedTitle={t('canvas:slots.paidLocked')}
            />
            <span className="px-2 py-0.5 text-[0.63rem] font-black bg-live text-foreground tracking-wider">
              {t('canvas:slots.heroBanner')}
            </span>

            {/* Editable Ad Price Pill for Hero */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center space-x-0.5 bg-card px-1.5 py-0.5 border border-border  hover:border-live transition-colors"
              title={t('canvas:slots.priceEditTitle')}
            >
              <span className="text-xs font-mono font-bold text-secondary-foreground">$</span>
              <input
                type="number"
                aria-label={t('canvas:slots.priceAria', { id: 1 })}
                value={localPrice}
                readOnly={isPaid}
                title={isPaid ? t('canvas:slots.paidLocked') : t('canvas:slots.priceEditTitle')}
                onChange={(e) => setLocalPrice(Number(e.target.value))}
                onBlur={handleCommitPrice}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCommitPrice();
                    e.currentTarget.blur();
                  }
                }}
                className="w-14 bg-transparent text-xs font-mono font-bold text-foreground text-right focus:outline-none focus:ring-1 focus:ring-live px-0.5 cursor-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[0.63rem] font-mono text-muted-foreground">USD</span>
            </div>

            {getStatusBadge(slot.status)}
          </div>
          <h3
            className={`text-base font-bold tracking-tight ${isHeroVacant && !slot.businessName ? 'text-muted-foreground italic' : 'text-foreground'}`}
          >
            {slot.businessName ||
              (isHeroVacant
                ? t('canvas:slots.vacantPrefix', { name: categoryName })
                : categoryName)}
          </h3>
          <p
            className={`text-xs line-clamp-1 leading-snug ${isHeroVacant ? 'text-muted-foreground italic' : 'text-muted-foreground'}`}
          >
            {slot.offerHeadline || defaultHeadline}
          </p>

          <ContactStrip
            slot={slot}
            busy={busySlot === slot.slotNumber}
            onNextCandidate={onNextCandidate}
          />
        </div>

        <div className="flex flex-col items-end space-y-1">
          {/* Editable Avg Ticket for Hero */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center space-x-1 text-[0.63rem] font-mono text-muted-foreground"
            title={t('canvas:slots.ticketEditTitle')}
          >
            <span>{t('canvas:slots.ticketAvg')}</span>
            <input
              type="number"
              aria-label={t('canvas:slots.ticketAria', { id: 1 })}
              value={localTicket}
              readOnly={isPaid}
              onChange={(e) => setLocalTicket(Number(e.target.value))}
              onBlur={handleCommitTicket}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCommitTicket();
                  e.currentTarget.blur();
                }
              }}
              className="w-16 bg-card text-foreground font-semibold px-1 py-0.5 border border-border text-right focus:outline-none focus:ring-1 focus:ring-live cursor-text  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          <div className="flex items-center space-x-1.5 pt-1">
            <select
              aria-label={t('canvas:slots.statusAria', { id: 1 })}
              value={slot.status}
              disabled={isPaid}
              title={isPaid ? t('canvas:slots.paidLocked') : undefined}
              onChange={(e) => {
                e.stopPropagation();
                onUpdateStatus(1, e.target.value as SlotStatus);
              }}
              className="bg-card text-foreground border border-border text-xs px-2 py-1 font-semibold focus:outline-none cursor-pointer hover:border-muted-foreground/40 "
              onClick={(e) => e.stopPropagation()}
            >
              <option value="VACANT">{t('common:status.vacant')}</option>
              <option value="PROSPECTING">{t('common:status.negotiating')}</option>
              <option value="RESERVED">{t('common:status.reserved')}</option>
              <option value="PAID">{t('common:status.paid', { price: slot.priceUsd })}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border text-[0.69rem] text-muted-foreground">
        <span>{t('canvas:slots.exclusivity', { name: categoryName })}</span>
        <span>{t('canvas:slots.dominantFront')}</span>
      </div>
    </div>
  );
};

interface MediumSlotCardProps {
  slot: SlotState;
  onNextCandidate?: (slotNumber: number) => void;
  busySlot?: number | null;
  catDef: CategoryDefinition;
  onOpenEdit: (slotNumber: number) => void;
  onUpdateStatus: (slotNumber: number, status: SlotStatus) => void;
  onUpdatePrice?: (slotNumber: number, price: number) => void;
  onUpdateAvgTicket?: (slotNumber: number, ticket: number) => void;
  getStatusBadge: (status: SlotStatus) => React.ReactNode;
  /** This is the box the inspector is showing. */
  isSelected?: boolean;
}

const MediumSlotCard: React.FC<MediumSlotCardProps> = ({
  slot,
  onNextCandidate,
  busySlot = null,
  catDef,
  onOpenEdit,
  onUpdateStatus,
  onUpdatePrice,
  onUpdateAvgTicket,
  getStatusBadge,
  isSelected = false,
}) => {
  const { t } = useTranslation(['canvas', 'common']);
  const { attributes, listeners, setNodeRef, isDragging, isOver } = useSlotDrag(
    slot.slotNumber,
    slot.status === 'PAID',
  );
  const [localPrice, setLocalPrice] = useState<number>(slot.priceUsd);
  const [localTicket, setLocalTicket] = useState<number>(slot.avgTicketUsd ?? catDef.avgTicketUsd);

  useEffect(() => {
    setLocalPrice(slot.priceUsd);
  }, [slot.priceUsd]);

  useEffect(() => {
    setLocalTicket(slot.avgTicketUsd ?? catDef.avgTicketUsd);
  }, [slot.avgTicketUsd, catDef.avgTicketUsd]);

  const handleCommitPrice = () => {
    const num = Number(localPrice);
    if (!isNaN(num) && num > 0 && num !== slot.priceUsd && onUpdatePrice) {
      onUpdatePrice(slot.slotNumber, num);
    } else {
      setLocalPrice(slot.priceUsd);
    }
  };

  const handleCommitTicket = () => {
    const num = Number(localTicket);
    const currentTicket = slot.avgTicketUsd ?? catDef.avgTicketUsd;
    if (!isNaN(num) && num > 0 && num !== currentTicket && onUpdateAvgTicket) {
      onUpdateAvgTicket(slot.slotNumber, num);
    } else {
      setLocalTicket(currentTicket);
    }
  };

  const isMedVacant = slot.status === 'VACANT';
  const isPaid = slot.status === 'PAID';
  const medStyle = `text-foreground ${statusSkin(slot.status)}${isSelected ? ' ring-2 ring-live' : ''}`;

  // The box gives the size and the price; the slot's own category gives the
  // niche. They differ the moment an advertiser is dragged to another position,
  // and the niche is what has to travel with them.
  const niche = CLOSED_CATEGORIES.find((c) => c.id === slot.categoryId) ?? catDef;
  const categoryName = t(`common:categories.${niche.id}.name`, niche.name);
  const defaultHeadline = t(`common:categories.${niche.id}.headline`, niche.defaultHeadline);

  const dragStyle = isOver
    ? 'ring-2 ring-primary border-primary bg-primary/10'
    : isDragging
      ? 'border-dashed border-primary/60 bg-primary/5 opacity-40'
      : medStyle;

  return (
    <div
      key={14}
      ref={setNodeRef}
      className={`col-span-1 sm:col-span-2 lg:col-span-2 relative border transition-colors p-3.5 flex flex-col justify-between min-h-[140px] cursor-pointer select-none ${dragStyle}`}
      onClick={() => onOpenEdit(14)}
    >
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="flex items-center space-x-1.5">
            <DragGrip
              attributes={attributes}
              listeners={listeners}
              title={t('canvas:ruler.dragTitle')}
              label={t('canvas:ruler.dragAria', { id: 14 })}
              locked={isPaid}
              lockedTitle={t('canvas:slots.paidLocked')}
            />
            <span
              className={`text-[0.63rem] font-mono font-bold ${isMedVacant ? 'text-muted-foreground' : 'text-muted-foreground'}`}
            >
              {t('canvas:slots.mediumSlot')}
            </span>
          </span>

          {/* Editable Ad Price Pill for Medium Slot */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center space-x-0.5 bg-card px-1.5 py-0.5 border border-border  hover:border-live transition-colors"
            title={t('canvas:slots.priceEditTitle')}
          >
            <span className="text-xs font-mono font-bold text-secondary-foreground">$</span>
            <input
              type="number"
              aria-label={t('canvas:slots.priceAria', { id: 14 })}
              value={localPrice}
              readOnly={isPaid}
              title={isPaid ? t('canvas:slots.paidLocked') : t('canvas:slots.priceEditTitle')}
              onChange={(e) => setLocalPrice(Number(e.target.value))}
              onBlur={handleCommitPrice}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCommitPrice();
                  e.currentTarget.blur();
                }
              }}
              className="w-12 bg-transparent text-xs font-mono font-bold text-foreground text-right focus:outline-none focus:ring-1 focus:ring-live px-0.5 cursor-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-[0.63rem] font-mono text-muted-foreground">USD</span>
          </div>
        </div>

        <div className="flex items-center justify-between mb-1">
          <h4
            className={`text-sm font-bold line-clamp-1 ${isMedVacant && !slot.businessName ? 'text-muted-foreground italic' : 'text-foreground'}`}
          >
            {slot.businessName ||
              (isMedVacant ? t('canvas:slots.vacantPrefix', { name: categoryName }) : categoryName)}
          </h4>
          {getStatusBadge(slot.status)}
        </div>
        <p
          className={`text-xs line-clamp-2 mt-1 leading-snug ${isMedVacant ? 'text-muted-foreground italic' : 'text-muted-foreground'}`}
        >
          {slot.offerHeadline || defaultHeadline}
        </p>

        <ContactStrip
          slot={slot}
          busy={busySlot === slot.slotNumber}
          onNextCandidate={onNextCandidate}
        />
      </div>

      <div className="pt-2 border-t border-border flex items-center justify-between mt-2">
        {/* Editable Avg Ticket for Medium Slot */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center space-x-1 text-[0.63rem] font-mono text-muted-foreground"
          title={t('canvas:slots.ticketEditTitle')}
        >
          <span>{t('canvas:slots.ticket')}</span>
          <input
            type="number"
            aria-label={t('canvas:slots.ticketAria', { id: 14 })}
            value={localTicket}
            onChange={(e) => setLocalTicket(Number(e.target.value))}
            onBlur={handleCommitTicket}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCommitTicket();
                e.currentTarget.blur();
              }
            }}
            className="w-14 bg-card text-foreground font-semibold px-1 py-0.5 border border-border text-right focus:outline-none focus:ring-1 focus:ring-live cursor-text  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-[0.63rem] text-muted-foreground">
            {t('canvas:slots.strategicPosition')}
          </span>
        </div>

        <select
          aria-label={t('canvas:slots.statusAria', { id: 14 })}
          value={slot.status}
          disabled={isPaid}
          title={isPaid ? t('canvas:slots.paidLocked') : undefined}
          onChange={(e) => {
            e.stopPropagation();
            onUpdateStatus(14, e.target.value as SlotStatus);
          }}
          className="bg-card text-foreground border border-border text-[0.69rem] px-2 py-1 font-medium focus:outline-none cursor-pointer hover:border-muted-foreground/40 "
          onClick={(e) => e.stopPropagation()}
        >
          <option value="VACANT">{t('common:status.vacant')}</option>
          <option value="PROSPECTING">{t('common:status.negotiating')}</option>
          <option value="RESERVED">{t('common:status.reserved')}</option>
          <option value="PAID">{t('common:status.paid', { price: slot.priceUsd })}</option>
        </select>
      </div>
    </div>
  );
};

export const PostalCanvas: React.FC<PostalCanvasProps> = ({
  slots,
  onUpdateSlotStatus,
  onUpdateSlotBusiness,
  onUpdateSlotPrice,
  onUpdateSlotAvgTicket,
  onSwapSlots,
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
  fillReport = null,
  onQuickSimulateAllPaid,
  onExecuteCuration,
  onSourceLeadForSlot,
  onClearSlot,
  isSaving = false,
  isLoading = false,
  inspectorOpen = false,
  onCloseInspector,
  inspectorNode = null,
}) => {
  const { t } = useTranslation(['canvas', 'common']);
  const [activeSide, setActiveSide] = useState<CardSide>('FRONT');
  const [confirmingReset, setConfirmingReset] = useState(false);

  // The inspector can send a box to the other face; the card turns over with
  // it, so the operator keeps looking at what they are working on.
  useEffect(() => {
    if (selectedSlot != null) setActiveSide(selectedSlot >= 8 ? 'BACK' : 'FRONT');
  }, [selectedSlot]);

  // 8px of travel before a drag starts, so the price and status controls inside
  // a box still take a plain click.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // The box being carried, for the ghost that follows the pointer.
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);

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

  // Semántica clara y de alto contraste para badges
  const getStatusBadge = (status: SlotStatus) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[0.63rem] font-bold bg-clear/15 text-clear border border-clear/40">
            <CheckCircle2 className="w-3 h-3 mr-1 text-clear" /> {t('common:status.paidBadge')}
          </span>
        );
      case 'RESERVED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[0.63rem] font-bold bg-due/15 text-due border border-due/40">
            <Clock className="w-3 h-3 mr-1 text-due" /> {t('common:status.reservedBadge')}
          </span>
        );
      case 'PROSPECTING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[0.63rem] font-bold bg-live/15 text-live border border-live/40">
            <Eye className="w-3 h-3 mr-1 text-live animate-pulse" />{' '}
            {t('common:status.negotiatingBadge')}
          </span>
        );
      default:
        // VACANTE: Badge gris neutro sin saturación
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-[0.63rem] font-bold bg-secondary text-muted-foreground border border-border">
            {t('common:status.vacantBadge')}
          </span>
        );
    }
  };

  /** Clicking a box opens it in the inspector; the card itself never edits. */
  const handleOpenEdit = (slotNum: number) => onInspectSlot?.(slotNum);

  /**
   * Any box can trade places with any other box, the hero and the back panel
   * included: the advertisers negotiate position, and a bigger box is simply
   * worth more. The USPS zone is not a box and is never registered as one.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingSlot(null);
    if (!over || !onSwapSlots) return;
    // The USPS zone is a target only so it can swallow the drop.
    if (over.id === USPS_DROP_ID) return;
    const activeId = Number(active.id);
    const overId = Number(over.id);
    if (activeId !== overId) onSwapSlots(activeId, overId);
  };

  const handleDragStart = (event: DragStartEvent) => setDraggingSlot(Number(event.active.id));

  return (
    <div className="space-y-6 min-w-0">
      {/* Control Bar */}
      <div className="flex flex-col gap-3 sm:gap-4 bg-card border border-border p-3 sm:p-4 text-card-foreground transition-colors">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Undo for the whole card. Dragging is cheap to do and cheap to get
              wrong, so there has to be a way back to the arrangement the card
              was designed with. */}
          {onAutofill && (
            <button
              id="btn-autofill-slots"
              type="button"
              onClick={onAutofill}
              disabled={isFilling || isSaving}
              title={t('canvas:actions.autofillTitle')}
              className="imperative flex min-h-11 items-center gap-2 border border-live bg-live px-4 text-[0.69rem] text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isFilling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {t(isFilling ? 'canvas:actions.autofilling' : 'canvas:actions.autofill')}
            </button>
          )}
          {isDemo && onMarkAllPaid && (
            <button
              id="btn-mark-all-paid"
              type="button"
              onClick={onMarkAllPaid}
              disabled={isSaving}
              title={t('canvas:actions.markAllPaidTitle')}
              className="flex min-h-11 items-center gap-1.5 border border-clear px-3 text-[0.69rem] font-bold text-clear transition-colors hover:bg-clear hover:text-background disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t('canvas:actions.markAllPaid')}
            </button>
          )}
          {onResetLayout &&
            (confirmingReset ? (
              // Emptying the card throws away fourteen advertisers and whatever
              // was collected from them. Cheap to redo in a rehearsal, still
              // worth one deliberate second.
              <span className="flex min-h-11 items-center gap-1 border border-due px-2">
                <span className="text-[0.69rem] font-bold text-due">
                  {t('canvas:actions.resetWipeConfirm')}
                </span>
                <button
                  id="btn-reset-wipe-yes"
                  type="button"
                  onClick={() => {
                    setConfirmingReset(false);
                    onResetLayout(true);
                  }}
                  disabled={isSaving}
                  className="min-h-11 px-2 text-[0.69rem] font-bold text-due transition-colors hover:bg-due hover:text-background disabled:opacity-40"
                >
                  {t('canvas:actions.resetWipeYes')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="min-h-11 px-2 text-[0.69rem] font-bold text-ink-dim transition-colors hover:text-ink"
                >
                  {t('canvas:actions.resetWipeNo')}
                </button>
              </span>
            ) : (
              <button
                id="btn-reset-layout"
                type="button"
                onClick={() => (isDemo ? setConfirmingReset(true) : onResetLayout(false))}
                disabled={isSaving}
                title={t(isDemo ? 'canvas:actions.resetWipeTitle' : 'canvas:actions.resetLayoutTitle')}
                className="flex min-h-11 items-center gap-1.5 border border-border px-3 text-[0.69rem] font-bold text-secondary-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t(isDemo ? 'canvas:actions.resetWipe' : 'canvas:actions.resetLayout')}
              </button>
            ))}
          <div className="flex bg-secondary p-1 border border-border space-x-1">
            <button
              id="btn-side-front"
              onClick={() => setActiveSide('FRONT')}
              className={`px-4 py-1.5 text-xs font-bold transition-colors cursor-pointer border ${
                activeSide === 'FRONT'
                  ? 'bg-primary border-primary text-primary-foreground '
                  : 'bg-card border-border text-secondary-foreground hover:bg-accent'
              }`}
            >
              {t('canvas:ruler.frontTab')}
            </button>
            <button
              id="btn-side-back"
              onClick={() => setActiveSide('BACK')}
              className={`px-4 py-1.5 text-xs font-bold transition-colors cursor-pointer border ${
                activeSide === 'BACK'
                  ? 'bg-primary border-primary text-primary-foreground '
                  : 'bg-card border-border text-secondary-foreground hover:bg-accent'
              }`}
            >
              {t('canvas:ruler.backTab')}
            </button>
          </div>
          <span className="text-xs text-muted-foreground hidden lg:inline font-mono">
            {t('canvas:ruler.dimensions')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
          {/* These belong to the form's own sections now; the canvas keeps only
 the controls that act on the card itself. */}
          {onQuickSimulateAllPaid && (
            <button
              id="btn-quick-fill-paid"
              onClick={onQuickSimulateAllPaid}
              disabled={isSaving || isLoading}
              className="text-xs font-medium bg-secondary hover:bg-accent text-secondary-foreground border border-border px-3 py-1.5 flex items-center space-x-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title={t('canvas:actions.autoFillTitle')}
            >
              <CheckCheck className="w-3.5 h-3.5 text-clear" />
              <span>
                {isSaving ? t('canvas:actions.autoFillSaving') : t('canvas:actions.autoFillDemo')}
              </span>
            </button>
          )}

          {onExecuteCuration && (
            <button
              id="btn-trigger-curation-canvas"
              onClick={onExecuteCuration}
              disabled={!isMasterUnlocked}
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 transition-colors ${
                isMasterUnlocked
                  ? 'bg-live text-primary-foreground cursor-pointer'
                  : 'bg-muted text-muted-foreground cursor-not-allowed border border-border'
              }`}
            >
              {isMasterUnlocked ? (
                <Unlock className="w-3.5 h-3.5" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              <span>{t('canvas:actions.runCuration')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Scaled Postcard Frame 12" x 9" (Canvas Mesa de Trabajo) */}
      {/* The card is 12"x9" at a fixed aspect; below roughly 620px it cannot
          shrink further without the slot controls becoming unusable, so the
          frame scrolls rather than clipping them out of reach. */}
      <div
        data-tour="canvas"
        className="relative bg-canvas-bg border border-dashed border-border p-4 sm:p-6 overflow-x-auto transition-colors"
      >
        <div className="min-w-[560px]">
          {/* Physical measurements rulers indicator */}
          <div className="flex items-center justify-between text-[0.69rem] font-mono text-muted-foreground pb-2 border-b border-border mb-4">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5  bg-primary inline-block"></span>
              <span className="font-semibold text-foreground">
                {activeSide === 'FRONT' ? t('canvas:ruler.front') : t('canvas:ruler.back')}
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-primary hidden md:inline font-medium">
                {t('canvas:ruler.dragHint')}
              </span>
              <span>{t('canvas:ruler.widthHeight')}</span>
            </div>
          </div>

          {/* The Card Surface: SIEMPRE Papel Blanco Impreso Postal de Alta Calidad */}
          {/* One drag context for the whole sheet. Positions are measured on
              every frame so a box dropped after the layout shifts still lands
              where the pointer is. */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDraggingSlot(null)}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          >
            {/* The sheet keeps the card's real proportion — 12" x 9" is 4:3 —
                and takes the width it is given. Sizing it by viewport height
                left it floating in the middle of a wide monitor, which is the
                opposite of what a working surface should do: the paper is the
                subject, so it gets the room. Below lg the boxes need their own
                height more than the paper needs its shape. */}
            <div className="border-4 border-border bg-card p-3 sm:p-4 text-foreground transition-all duration-300">
              {activeSide === 'FRONT' ? (
                /* FRONT LAYOUT:
                 Row 1: 1 Hero Banner (12.0" x 3.2" - $850) occupying 100% full dominant top width [ANCLADO]
                 Row 2 & 3: Cuadrícula estricta de 3 columnas × 2 filas (Slots 2 al 7) [DND SORTABLE]
                */
                <div className="space-y-3">
                  {/* HERO BANNER - Slot 1 (100% full width top, anclado) */}
                  <HeroSlotCard
                    slot={getSlot(1)}
                    onNextCandidate={onNextCandidate}
                    busySlot={busySlot}
                    catDef={frontCategories[0]}
                    onOpenEdit={handleOpenEdit}
                    onUpdateStatus={onUpdateSlotStatus}
                    onUpdatePrice={onUpdateSlotPrice}
                    onUpdateAvgTicket={onUpdateSlotAvgTicket}
                    getStatusBadge={getStatusBadge}
                    isSelected={selectedSlot === 1}
                  />

                  {/* 6 STANDARD SLOTS (Slots 2 al 7) - Cuadrícula estricta de 3 columnas × 2 filas */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {frontCategories.slice(1).map((catDef) => (
                      <SortableSlotCard
                        key={catDef.id}
                        slot={getSlot(catDef.id)}
                        onNextCandidate={onNextCandidate}
                        busySlot={busySlot}
                        catDef={catDef}
                        onOpenEdit={handleOpenEdit}
                        onUpdateStatus={onUpdateSlotStatus}
                        onUpdatePrice={onUpdateSlotPrice}
                        onUpdateAvgTicket={onUpdateSlotAvgTicket}
                        getStatusBadge={getStatusBadge}
                        isSelected={selectedSlot === catDef.id}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                /* BACK LAYOUT:
                 Grid de 3 columnas estricto:
                                - Fila 1 (Grid 3 cols): Slot 8, Slot 9, Slot 10.
                                - Fila 2 (Grid 3 cols): Slot 11, Slot 12, Slot 13.
                                - Fila 3: Slot 14 (Medium Slot ~7"×3") con col-span-2 y Cuadro Postal USPS (~5"×3") con col-span-1.
                */
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Fila 1 (Slots 8, 9, 10) & Fila 2 (Slots 11, 12, 13) */}
                  {backCategories
                    .filter((c) => c.id >= 8 && c.id <= 13)
                    .map((catDef) => (
                      <SortableSlotCard
                        key={catDef.id}
                        slot={getSlot(catDef.id)}
                        onNextCandidate={onNextCandidate}
                        busySlot={busySlot}
                        catDef={catDef}
                        onOpenEdit={handleOpenEdit}
                        onUpdateStatus={onUpdateSlotStatus}
                        onUpdatePrice={onUpdateSlotPrice}
                        onUpdateAvgTicket={onUpdateSlotAvgTicket}
                        getStatusBadge={getStatusBadge}
                        isSelected={selectedSlot === catDef.id}
                      />
                    ))}

                  {/* Fila 3: Slot 14 (Medium Slot ~7"×3") con col-span-2 */}
                  <MediumSlotCard
                    slot={getSlot(14)}
                    onNextCandidate={onNextCandidate}
                    busySlot={busySlot}
                    catDef={backCategories.find((c) => c.id === 14)!}
                    onOpenEdit={handleOpenEdit}
                    onUpdateStatus={onUpdateSlotStatus}
                    onUpdatePrice={onUpdateSlotPrice}
                    onUpdateAvgTicket={onUpdateSlotAvgTicket}
                    getStatusBadge={getStatusBadge}
                    isSelected={selectedSlot === 14}
                  />

                  {/* Fila 3: Cuadro Postal USPS (~5"×3") con col-span-1 */}
                  <UspsZone refuseLabel={t('canvas:usps.locked')}>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[0.63rem] font-black tracking-wider text-live font-mono">
                          {t('canvas:usps.title')}
                        </span>
                        <span className="text-[0.63rem] font-mono text-muted-foreground">
                          {USPS_TECHNICAL_SLOT.widthInches}" × {USPS_TECHNICAL_SLOT.heightInches}"
                        </span>
                      </div>

                      {/* Postal Indicia Mock */}
                      <div className="border border-border p-1 text-center text-[0.56rem] font-mono uppercase bg-card leading-tight text-foreground ">
                        <p className="font-bold text-foreground">{t('canvas:usps.standard')}</p>
                        <p>{t('canvas:usps.ecrwss')}</p>
                        <p>{t('canvas:usps.postagePaid')}</p>
                        <p>{t('canvas:usps.city')}</p>
                        <p>{t('canvas:usps.permit')}</p>
                      </div>

                      {/* Recipient Window Simulation. With routes planned this
                          stops being a mock-up: it prints the real endorsement
                          and the real number of boxes the drop will reach. */}
                      <div className="border border-dashed border-border p-1.5 bg-card text-[0.56rem] font-mono text-foreground ">
                        <p className="text-live font-bold">{t('canvas:usps.route')}</p>
                        <p className="text-foreground font-medium">{t('canvas:usps.resident')}</p>
                        {coveredHouseholds > 0 ? (
                          <p id="usps-coverage" className="text-clear font-bold">
                            {t('canvas:usps.saturation', {
                              households: coveredHouseholds.toLocaleString('en-US'),
                              routes: selectedRoutes,
                            })}
                          </p>
                        ) : (
                          <>
                            <p className="text-muted-foreground">{t('canvas:usps.address')}</p>
                            <p className="text-muted-foreground">{t('canvas:usps.cityStateZip')}</p>
                          </>
                        )}
                      </div>
                    </div>

                    <p className="text-[0.56rem] text-muted-foreground italic pt-1 border-t border-live/40">
                      {t('canvas:usps.note')}
                    </p>
                  </UspsZone>
                </div>
              )}
            </div>

            {/* Slide-over Inspector Drawer (Propuesta 1: Panel Flotante con Scroll Aislado) */}
            {inspectorNode && (
              <>
                {/* Backdrop sutil en móvil/tablet para cerrar al tocar fuera */}
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

            {/* The ghost that follows the pointer: enough to know what is in
                flight without dragging a full card around. */}
            <DragOverlay dropAnimation={null}>
              {draggingSlot !== null && (
                <div className="border border-primary bg-card px-3 py-2 shadow-lg">
                  <p className="font-mono text-[0.63rem] font-bold text-primary">
                    SLOT {draggingSlot}
                  </p>
                  <p className="text-xs font-bold text-foreground">
                    {getSlot(draggingSlot).businessName ||
                      t(`common:categories.${draggingSlot}.name`)}
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
