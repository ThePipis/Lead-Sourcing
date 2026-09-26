import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Eraser,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  Phone,
  RotateCcw,
  Sparkles,
  Star,
  Unlock,
  X,
} from 'lucide-react';
import { CLOSED_CATEGORIES } from '../data/categories.ts';
import {
  addToBlacklist,
  fetchReplacementLead,
  isBlacklisted,
  searchCategoryLeads,
  updateLeadStatus,
} from '../services/leadSourcingService.ts';
import { CategoryDefinition, LeadProspect, SlotState, SlotStatus } from '../types.ts';
import {
  formatReservationCountdown,
  getSlotDiscountedPrice,
  getSlotReservationInfo,
  isReservationExpired,
} from '../utils/modularGrid.ts';

interface SlotInspectorProps {
  slot: SlotState;
  /** Every box, so the move-to list can say who is sitting where. */
  slots: SlotState[];
  campaignId?: string;
  targetCity: string;
  targetZip: string;
  /** The app's world: seeded candidates in the practice file, real APIs live. */
  mockMode: boolean;
  isSaving: boolean;
  onClose: () => void;
  onUpdateBusiness: (slotNumber: number, businessName: string, headline?: string) => void;
  onUpdateStatus: (slotNumber: number, status: SlotStatus) => void;
  onReactivateOffer?: (slotNumber: number) => void;
  onSwapSlots: (source: number, target: number) => void;
  onClearSlot: (slotNumber: number) => void;
  onUndoPayment: (slotNumber: number, targetStatus?: SlotStatus, clearBusiness?: boolean) => void;
  onAssignLead: (slotNumber: number, lead: LeadProspect, targetStatus?: SlotStatus) => void;
}

/** How long a field sits still before it is written to disk. */
const AUTOSAVE_MS = 400;

/**
 * Everything one advertising box needs, beside the card instead of on top of it.
 *
 * Selling a box is one movement — look at who is available, call them, write
 * their name and their offer, record the money — and it used to be three
 * screens: a modal over the card, a scroll down to prospecting, a scroll back.
 * The inspector puts the movement in one column next to the paper, so the card
 * never leaves the operator's sight while they work a box.
 *
 * Nothing here has a save button. Text is written to SQLite when typing settles
 * and again when the field loses focus; every other control writes on the click.
 */
export const SlotInspector: React.FC<SlotInspectorProps> = ({
  slot,
  slots,
  campaignId,
  targetCity,
  targetZip,
  mockMode,
  isSaving,
  onClose,
  onUpdateBusiness,
  onUpdateStatus,
  onReactivateOffer,
  onSwapSlots,
  onClearSlot,
  onUndoPayment,
  onAssignLead,
}) => {
  const { t, i18n } = useTranslation(['canvas', 'prospecting', 'common']);

  // The box gives the size and the price; the niche travels with the advertiser,
  // so a box someone was dragged into is still sold as their own trade.
  const niche: CategoryDefinition =
    CLOSED_CATEGORIES.find((c) => c.id === slot.categoryId) ??
    CLOSED_CATEGORIES.find((c) => c.id === slot.slotNumber) ??
    CLOSED_CATEGORIES[0];

  const isPaid = slot.status === 'PAID';
  const nicheName = t(`common:categories.${niche.id}.name`, niche.name);

  const hasBusiness = Boolean(slot.businessName && slot.businessName.trim());
  const [showManualForm, setShowManualForm] = useState(false);
  const [showAlternativeProspects, setShowAlternativeProspects] = useState(false);

  const [name, setName] = useState(slot.businessName ?? '');
  const [headline, setHeadline] = useState(slot.offerHeadline ?? '');
  const [leads, setLeads] = useState<LeadProspect[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [crm, setCrm] = useState<Record<string, LeadProspect['status']>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const pitchLang: 'es' | 'en' = (i18n.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [justReleasedName, setJustReleasedName] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  const timer = useRef<number | undefined>(undefined);
  // What is already on disk, so a settled edit that changed nothing writes
  // nothing. The server's own copy is the reference, not the last keystroke.
  const saved = useRef({ name: slot.businessName ?? '', headline: slot.offerHeadline ?? '' });
  const currentSlotNumber = useRef(slot.slotNumber);
  const latestDraft = useRef({ name: slot.businessName ?? '', headline: slot.offerHeadline ?? '' });
  latestDraft.current = { name, headline };

  // Follow the box the operator clicked, and never carry one box's draft into
  // the next one.
  useEffect(() => {
    const isNewSlot = currentSlotNumber.current !== slot.slotNumber;
    currentSlotNumber.current = slot.slotNumber;

    if (isNewSlot) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      setName(slot.businessName ?? '');
      setHeadline(slot.offerHeadline ?? '');
      saved.current = { name: slot.businessName ?? '', headline: slot.offerHeadline ?? '' };
      setConfirmingClear(false);
      setShowManualForm(false);
      setShowAlternativeProspects(false);
    } else {
      if (slot.businessName !== undefined && slot.businessName !== saved.current.name) {
        setName(slot.businessName ?? '');
        saved.current.name = slot.businessName ?? '';
      }
      if (slot.offerHeadline !== undefined && slot.offerHeadline !== saved.current.headline) {
        setHeadline(slot.offerHeadline ?? '');
        saved.current.headline = slot.offerHeadline ?? '';
      }
    }

    if (slot.businessName) {
      setJustReleasedName(null);
    }
  }, [slot.slotNumber, slot.businessName, slot.offerHeadline]);

  // Flush pending commit on unmount
  useEffect(() => {
    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        const d = latestDraft.current;
        if (d.name !== saved.current.name || d.headline !== saved.current.headline) {
          onUpdateBusiness(currentSlotNumber.current, d.name, d.headline);
        }
      }
    };
  }, [onUpdateBusiness]);

  const commit = (nextName: string, nextHeadline: string) => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (nextName === saved.current.name && nextHeadline === saved.current.headline) return;
    saved.current = { name: nextName, headline: nextHeadline };
    onUpdateBusiness(slot.slotNumber, nextName, nextHeadline);
  };

  const schedule = (nextName: string, nextHeadline: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(nextName, nextHeadline), AUTOSAVE_MS);
  };

  const handleAssign = (lead: LeadProspect) => {
    const chosenHeadline = lead.bilingualHooks?.[pitchLang] || lead.bilingualHooks?.es || '';
    setName(lead.businessName);
    setHeadline(chosenHeadline);
    saved.current = { name: lead.businessName, headline: chosenHeadline };
    setShowManualForm(false);
    onAssignLead(slot.slotNumber, lead, 'RESERVED');
  };

  const handleContactLead = (lead: LeadProspect) => {
    if (isPaid) return;

    const currentName = (slot.businessName || name || '').trim();
    if (
      currentName &&
      currentName.toLowerCase() !== lead.businessName.trim().toLowerCase()
    ) {
      const confirmed = window.confirm(
        t('prospecting:crm.confirmReplaceContacted', {
          current: currentName,
          next: lead.businessName,
          slot: slot.slotNumber,
        }),
      );
      if (!confirmed) return;
    }

    setCrm((prev) => ({ ...prev, [lead.id]: 'CONTACTED' }));
    updateLeadStatus(lead.id, 'CONTACTED').catch(() => undefined);

    const chosenHeadline = lead.bilingualHooks?.[pitchLang] || lead.bilingualHooks?.es || '';
    setName(lead.businessName);
    setHeadline(chosenHeadline);
    saved.current = { name: lead.businessName, headline: chosenHeadline };
    setShowManualForm(false);
    onAssignLead(slot.slotNumber, lead, 'PROSPECTING');
  };

  const handleRejectLead = (lead: LeadProspect) => {
    const currentName = (slot.businessName || name || '').trim();
    if (
      currentName &&
      currentName.toLowerCase() === lead.businessName.trim().toLowerCase()
    ) {
      handleRelease();
    } else {
      markCrm(lead, 'REJECTED');
    }
  };

  const handleRelease = () => {
    const releasedName = (slot.businessName || name || '').trim();
    setConfirmingClear(false);
    setName('');
    setHeadline('');
    saved.current = { name: '', headline: '' };
    setShowManualForm(false);
    setShowAlternativeProspects(false);

    if (releasedName) {
      // 1. Persistir exclusión en lista negra local
      addToBlacklist(releasedName, campaignId);

      // 2. Marcar en CRM como REJECTED
      const matched = leads.find(
        (l) => l.businessName.trim().toLowerCase() === releasedName.toLowerCase(),
      );
      if (matched) {
        markCrm(matched, 'REJECTED');
      } else {
        const dummyBlocked: LeadProspect = {
          id: `LEAD-RELEASED-${Date.now()}`,
          categoryId: niche.id,
          businessName: releasedName,
          name: releasedName,
          categoryName: niche.name,
          category: niche.name,
          address: slot.businessAddress || `${targetCity}, CA ${targetZip}`,
          city: targetCity,
          zip: targetZip,
          phone: slot.phone || '',
          source: 'Comercio Previo',
          decisionMaker: slot.contactPerson || 'Dueño / Decisor',
          decisionMakerTitle: 'Dueño',
          avgTicketEstimated: slot.avgTicketUsd || niche.avgTicketUsd || 500,
          bilingualHooks: {
            es: slot.offerHeadline || '',
            en: '',
          },
          roiPitch: '',
          status: 'REJECTED',
        };
        setLeads((prev) => [dummyBlocked, ...prev.slice(0, 2)]);
        setCrm((prev) => ({ ...prev, [dummyBlocked.id]: 'REJECTED' }));
      }
      setJustReleasedName(releasedName);
    }

    onClearSlot(slot.slotNumber);
  };

  const handleReplaceBlockedLead = async (leadToReplace: LeadProspect) => {
    setReplacingId(leadToReplace.id);
    try {
      const excluded = [
        ...leads.map((l) => l.businessName),
        leadToReplace.businessName,
        ...(justReleasedName ? [justReleasedName] : []),
      ];

      const replacement = await fetchReplacementLead(
        niche.id,
        targetCity,
        targetZip,
        excluded,
        mockMode,
        campaignId,
      );

      if (replacement) {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadToReplace.id ? replacement : l)),
        );
        if (
          justReleasedName &&
          justReleasedName.toLowerCase() === leadToReplace.businessName.toLowerCase()
        ) {
          setJustReleasedName(null);
        }
      }
    } catch (err) {
      console.error('Failed to replace blocked lead:', err);
    } finally {
      setReplacingId(null);
    }
  };

  // Close inspector on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Inspector panel ref
  const panel = useRef<HTMLElement | null>(null);

  // Close inspector on click outside the panel
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  // Who is available for this trade. The list is the reason to open the panel,
  // so it loads with it rather than waiting for a second click.
  useEffect(() => {
    let alive = true;
    setLoadingLeads(true);
    searchCategoryLeads(targetCity, targetZip, niche.id, mockMode, [], campaignId)
      .then((data) => {
        if (!alive) return;
        setLeads(data);
        setLoadingLeads(false);
      })
      .catch(() => alive && setLoadingLeads(false));
    return () => {
      alive = false;
    };
  }, [targetCity, targetZip, niche.id, mockMode, campaignId]);

  const markCrm = (lead: LeadProspect, status: 'CONTACTED' | 'REJECTED') => {
    setCrm((prev) => ({ ...prev, [lead.id]: status }));
    if (status === 'REJECTED') {
      addToBlacklist(lead.businessName, campaignId);
    }
    updateLeadStatus(lead.id, status).catch(() => undefined);
  };

  const copyPitch = (lead: LeadProspect) => {
    const text = lead.bilingualHooks?.[pitchLang] || lead.bilingualHooks?.es || '';
    navigator.clipboard.writeText(text).catch(() => undefined);
    setCopiedId(lead.id);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <aside
      ref={panel}
      id="slot-inspector"
      aria-label={t('canvas:inspector.aria', { id: slot.displayNumber ?? slot.slotNumber })}
      className="flex h-full min-h-0 flex-col border border-border/80 bg-card text-card-foreground shadow-sm overscroll-contain"
    >
      {/* ---------------------------------------------------------- header compacto */}
      <div className="shrink-0 flex items-center justify-between border-b border-border bg-secondary/50 px-3 py-1.5">
        <span className="font-mono text-xs font-bold text-primary flex items-center gap-1.5 min-w-0">
          <span className="shrink-0">{t('canvas:inspector.slotLabel', { id: slot.displayNumber ?? slot.slotNumber })}</span>
          <span className="text-muted-foreground/60 shrink-0">·</span>
          <span className="font-sans font-semibold text-foreground text-xs truncate">{nicheName}</span>
        </span>
        <button
          id="btn-inspector-close"
          type="button"
          onClick={onClose}
          aria-label={t('canvas:inspector.close')}
          title={t('canvas:inspector.close')}
          className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors cursor-pointer shrink-0 ml-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain flex flex-col">
        {isPaid || hasBusiness || showManualForm ? (
          <>
            {/* ------------------------------------------------- the ad itself */}
            <section className="space-y-2 border-b border-border px-3 py-2">
              <div className="flex items-center justify-between">
                <h3 className="field-label">{t('canvas:inspector.adSection')}</h3>
                <StatusPill status={slot.status} />
              </div>

              {isPaid && (
                <div className="flex items-start justify-between gap-2 border border-clear/50 bg-clear/10 px-2.5 py-1.5 text-xs leading-relaxed text-clear">
                  <div className="flex items-start gap-1.5">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="text-[0.68rem]">
                      {t(
                        'canvas:inspector.paidNotice',
                        'Espacio pagado y confirmado. Puedes personalizar el nombre comercial y titular de la oferta para la tirada.'
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUndoPayment(slot.slotNumber, 'RESERVED', false)}
                    className="shrink-0 text-[0.65rem] font-bold text-due hover:underline flex items-center gap-1 cursor-pointer bg-due/10 px-1.5 py-0.5 border border-due/40 rounded"
                    title={t('canvas:inspector.unlockTitle', 'Desbloquear cobro y regresar a Reservado')}
                  >
                    <Unlock className="h-2.5 w-2.5" />
                    {t('canvas:inspector.unlock', 'Desbloquear')}
                  </button>
                </div>
              )}

              <label className="block">
                <span className="field-label">{t('canvas:modal.businessNameLabel')}</span>
                <input
                  id="inspector-business-name"
                  type="text"
                  value={name}
                  placeholder={niche.name || t('canvas:modal.businessNamePlaceholder')}
                  onChange={(e) => {
                    setName(e.target.value);
                    schedule(e.target.value, headline);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={() => commit(name, headline)}
                  className="mt-0.5 w-full border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-live focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="field-label">{t('canvas:modal.headlineLabel')}</span>
                <textarea
                  id="inspector-headline"
                  rows={2}
                  value={headline}
                  placeholder={niche.defaultHeadline || t('canvas:modal.headlinePlaceholder')}
                  onChange={(e) => {
                    setHeadline(e.target.value);
                    schedule(name, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={() => commit(name, headline)}
                  className="mt-0.5 w-full resize-none border border-border bg-background px-2 py-1 text-xs leading-relaxed text-foreground focus:border-live focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="field-label flex items-center gap-1.5">
                  <ArrowLeftRight className="h-3 w-3" />
                  {t('canvas:modal.moveToLabel')}
                </span>
                <select
                  id="inspector-move-to"
                  value={slot.slotNumber}
                  disabled={isPaid}
                  onChange={(e) => {
                    const target = Number(e.target.value);
                    if (target !== slot.slotNumber) onSwapSlots(slot.slotNumber, target);
                  }}
                  className="mt-0.5 w-full border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-live focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {slots
                    .filter((s) => !s.notes?.startsWith('Covered by') && s.format !== 'USPS')
                    .map((s) => {
                      const fmtLabel =
                        s.format === 'LARGE'
                          ? ' [Grande 2×2]'
                          : s.format === 'MEDIUM'
                          ? ' [Mediano 1×2]'
                          : ' [Chico 1×1]';
                      return (
                        <option key={s.slotNumber} value={s.slotNumber}>
                          {t('canvas:modal.moveToOption', {
                            id: s.displayNumber ?? s.slotNumber,
                            side:
                              (CLOSED_CATEGORIES.find((c) => c.id === s.slotNumber)?.side ?? 'FRONT') ===
                              'FRONT'
                                ? t('canvas:ruler.frontTab')
                                : t('canvas:ruler.backTab'),
                            business: s.businessName || t('canvas:modal.moveToEmpty'),
                          })}
                          {fmtLabel}
                        </option>
                      );
                    })}
                </select>
              </label>

              {showManualForm && !hasBusiness && !isPaid && (
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="text-xs text-muted-foreground hover:text-foreground underline pt-0.5"
                >
                  ← Volver a lista de prospectos
                </button>
              )}
            </section>

            {/* --------------------------------------------- where the sale is */}
            <section className="space-y-1.5 border-b border-border px-3 py-2">
              <h3 className="field-label">{t('canvas:inspector.stateSection')}</h3>
              <p className="text-[0.67rem] leading-relaxed text-muted-foreground">
                {t('canvas:inspector.stateHint')}
              </p>
              <div className="flex flex-wrap gap-2">
                {isPaid ? (
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        id="btn-inspector-undo-payment"
                        type="button"
                        onClick={() => onUndoPayment(slot.slotNumber, 'RESERVED', false)}
                        disabled={isSaving}
                        className="flex-1 min-h-9 border border-live/70 bg-live/10 px-3 text-xs font-bold text-live transition-colors hover:bg-live hover:text-background disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Desbloquear el cobro manteniendo los datos del comercio para poder editarlos o renegociar"
                      >
                        <Unlock className="h-3.5 w-3.5" />
                        <span>Desbloquear cobro (Pasar a Reservado)</span>
                      </button>

                      <button
                        id="btn-inspector-rollback-vacant"
                        type="button"
                        onClick={() => onUndoPayment(slot.slotNumber, 'VACANT', true)}
                        disabled={isSaving}
                        className="flex-1 min-h-9 border border-due bg-due/10 px-3 text-xs font-bold text-due transition-colors hover:bg-due hover:text-background disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Rollback total: el cliente desistió o canceló el servicio. Anula el cobro y borra los datos dejando el slot vacante"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Dar de baja total (Rollback a Vacante)</span>
                      </button>
                    </div>
                    <span className="text-[0.68rem] text-muted-foreground leading-relaxed">
                      💡 <strong>Desbloquear cobro:</strong> Mantiene al anunciante pero quita el pago para renegociar o editar. <br/>
                      💡 <strong>Dar de baja total:</strong> Desvincula y desregistra al anunciante de la base de datos dejando el slot libre.
                    </span>
                  </div>
                ) : (
                  <>
                    {slot.status === 'RESERVED' ? (
                      <div className="col-span-full w-full p-2.5 bg-amber-500/10 border border-amber-500/30 rounded space-y-2 mb-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                            <Clock className="h-3.5 w-3.5" />
                            {isReservationExpired(slot)
                              ? '🚨 Reserva 72h Vencida'
                              : `⏳ Expira en: ${formatReservationCountdown(slot)}`}
                          </span>
                          <span className="font-mono font-bold text-xs bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-300">
                            ${getSlotDiscountedPrice(slot)} (-${getSlotReservationInfo(slot).discountUsd})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {onReactivateOffer && (
                            <button
                              type="button"
                              onClick={() => onReactivateOffer(slot.slotNumber)}
                              disabled={isSaving}
                              className="flex-1 py-1.5 px-2 bg-live text-primary-foreground font-bold text-xs rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-1 cursor-pointer"
                              title="Renovar 72 horas más y asegurar tarifa con descuento"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Reactivar Oferta (-${getSlotReservationInfo(slot).discountUsd})</span>
                            </button>
                          )}
                          <button
                            id="btn-inspector-mark-paid"
                            type="button"
                            onClick={() => onUpdateStatus(slot.slotNumber, 'PAID')}
                            disabled={isSaving || !slot.businessName}
                            className="flex-1 py-1.5 px-2 bg-clear text-primary-foreground font-black text-xs rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-1 cursor-pointer"
                            title="Registrar cobro y sellar slot como pagado"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>Cobrar / Pagar</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          id="btn-inspector-reserve"
                          type="button"
                          onClick={() => onUpdateStatus(slot.slotNumber, 'RESERVED')}
                          disabled={isSaving || !slot.businessName}
                          className="min-h-9 border border-due/60 px-3 text-xs font-bold text-due transition-colors hover:bg-due hover:text-background disabled:opacity-30 cursor-pointer"
                        >
                          {t('canvas:inspector.reserve')}
                        </button>
                        <button
                          id="btn-inspector-mark-paid"
                          type="button"
                          onClick={() => onUpdateStatus(slot.slotNumber, 'PAID')}
                          disabled={isSaving || !slot.businessName}
                          className="min-h-9 border border-clear px-3 text-xs font-bold text-clear transition-colors hover:bg-clear hover:text-background disabled:opacity-30 cursor-pointer"
                        >
                          {t('canvas:inspector.markPaid')}
                        </button>
                      </>
                    )}
                  </>
                )}

                {!isPaid &&
                  (hasBusiness || name) &&
                  (confirmingClear ? (
                    <span className="flex min-h-9 items-center gap-1 border border-due px-2">
                      <span className="text-[0.69rem] font-bold text-due">
                        {t('canvas:inspector.releaseConfirm')}
                      </span>
                      <button
                        id="btn-inspector-release-yes"
                        type="button"
                        onClick={handleRelease}
                        className="min-h-9 px-2 text-[0.69rem] font-bold text-due transition-colors hover:bg-due hover:text-background"
                      >
                        {t('canvas:actions.resetWipeYes')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingClear(false)}
                        className="min-h-9 px-2 text-[0.69rem] font-bold text-ink-dim transition-colors hover:text-ink"
                      >
                        {t('canvas:actions.resetWipeNo')}
                      </button>
                    </span>
                  ) : (
                    <button
                      id="btn-inspector-release"
                      type="button"
                      onClick={() => setConfirmingClear(true)}
                      disabled={isSaving}
                      className="flex min-h-9 items-center gap-1.5 border border-due/60 bg-due/10 px-3 text-xs font-bold text-due transition-colors hover:bg-due hover:text-background disabled:opacity-40"
                    >
                      <Eraser className="h-3.5 w-3.5" />
                      {t('canvas:inspector.release')}
                    </button>
                  ))}
              </div>
            </section>

            {/* Alternativas de prospección colapsables cuando ya hay comercio asignado */}
            {!isPaid && hasBusiness && leads.length > 0 && (
              <section className="px-3 py-1.5 border-b border-border">
                <button
                  type="button"
                  onClick={() => setShowAlternativeProspects(!showAlternativeProspects)}
                  className="flex items-center justify-between w-full text-xs font-mono font-medium text-muted-foreground hover:text-foreground py-0.5"
                >
                  <span>
                    {showAlternativeProspects
                      ? t('canvas:inspector.hideAlternatives', '▼ Ocultar prospectos alternativos')
                      : t('canvas:inspector.showAlternatives', {
                          defaultValue: '▶ Ver prospectos alternativos / respaldo ({{count}})',
                          count: leads.filter((l) => l.businessName !== slot.businessName).length,
                        })}
                  </span>
                </button>
                {showAlternativeProspects && (
                  <div className="mt-1.5 space-y-1.5">
                    {leads.map((lead, idx) => {
                      const status = crm[lead.id] ?? lead.status;
                      const isHere = slot.businessName === lead.businessName;
                      return (
                        <div
                          key={lead.id}
                          className={`border p-2 text-xs transition-colors rounded-sm ${
                            isHere
                              ? 'border-clear bg-clear/10'
                              : status === 'REJECTED'
                                ? 'border-border opacity-50'
                                : 'border-border hover:border-rule-strong'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5">
                                <span className="font-mono text-[0.63rem] font-bold text-primary">
                                  #{idx + 1}
                                </span>
                                <span className="truncate font-bold text-foreground">
                                  {lead.businessName}
                                </span>
                              </p>
                              <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                                {lead.phone}
                              </p>
                            </div>
                            {!isHere && (
                              <button
                                type="button"
                                onClick={() => handleAssign(lead)}
                                disabled={isPaid || isSaving}
                                className="px-2 py-0.5 text-[0.63rem] font-bold bg-secondary hover:bg-primary hover:text-primary-foreground border border-border cursor-pointer shrink-0"
                              >
                                {t('canvas:inspector.replaceWithThis', 'Reemplazar por este')}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        ) : (
          /* ------------------------------------------------- who to call (VACANT / PROSPECTS FIRST) */
          <section className="flex-1 flex flex-col justify-between p-3 min-h-0">
            {loadingLeads ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-xs text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p>{t('prospecting:crm.loading', { city: targetCity })}</p>
              </div>
            ) : leads.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-xs text-muted-foreground text-center">
                <p>{t('prospecting:crm.noLeads', { city: targetCity })}</p>
              </div>
            ) : (
              <ul className="flex-1 flex flex-col gap-2.5 sm:gap-3 min-h-0">
                {leads.map((lead, idx) => {
                  const status = crm[lead.id] ?? lead.status;
                  const isHere = slot.businessName === lead.businessName;
                  const isBlocked =
                    status === 'REJECTED' ||
                    (justReleasedName !== null &&
                      lead.businessName.trim().toLowerCase() === justReleasedName.trim().toLowerCase()) ||
                    isBlacklisted(lead.businessName, campaignId);

                  if (isBlocked) {
                    return (
                      <li
                        key={lead.id}
                        className="flex-1 min-h-[160px] flex flex-col justify-between border border-due/40 bg-due/5 p-3 sm:p-3.5 text-xs transition-colors rounded-md"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-muted-foreground">
                                #{idx + 1}
                              </span>
                              <span className="truncate font-semibold text-xs text-muted-foreground line-through">
                                {lead.businessName}
                              </span>
                            </p>
                            <p className="mt-0.5 text-[0.68rem] text-muted-foreground truncate">
                              {lead.address}, {lead.city}
                            </p>
                          </div>
                          <span className="shrink-0 inline-flex items-center gap-1 border border-due/40 bg-due/15 px-1.5 py-0.5 font-mono text-[0.6rem] font-bold text-due uppercase rounded-xs">
                            <Lock className="h-2.5 w-2.5" />
                            {t('prospecting:crm.blocked', 'Desestimó / Bloqueado')}
                          </span>
                        </div>

                        <div className="my-auto py-2">
                          <p className="text-xs text-muted-foreground italic text-center">
                            Prospecto descartado para esta campaña.
                          </p>
                        </div>

                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleReplaceBlockedLead(lead)}
                            disabled={replacingId === lead.id || isSaving}
                            className="flex w-full h-8 items-center justify-center gap-1.5 border border-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground px-2.5 text-xs font-bold text-primary rounded transition-all disabled:opacity-50 cursor-pointer"
                          >
                            {replacingId === lead.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>
                                  {t(
                                    'prospecting:crm.searchingReplacement',
                                    'Buscando nueva vacante de negocio...',
                                  )}
                                </span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5" />
                                <span>
                                  {t('prospecting:crm.searchReplacement', 'Buscar otra vacante o negocio')}
                                </span>
                              </>
                            )}
                          </button>
                        </div>
                      </li>
                    );
                  }

                  const currentHook = lead.bilingualHooks?.[pitchLang] || lead.bilingualHooks?.es;
                  return (
                    <li
                      key={lead.id}
                      className={`flex-1 min-h-[170px] flex flex-col justify-between border p-3 sm:p-3.5 text-xs transition-colors rounded-md shadow-2xs ${
                        isHere
                          ? slot.status === 'PROSPECTING'
                            ? 'border-live bg-live/10 ring-1 ring-live/40 shadow-xs'
                            : 'border-clear bg-clear/10 ring-1 ring-clear/40 shadow-xs'
                          : status === 'CONTACTED'
                            ? 'border-live/50 bg-live/5'
                            : 'border-border/90 bg-card hover:border-rule-strong hover:shadow-xs'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-xs font-black text-primary px-1.5 py-0.5 rounded-xs bg-primary/10 border border-primary/20 shrink-0">
                              #{idx + 1}
                            </span>
                            <span className="truncate font-bold text-sm text-foreground" title={lead.businessName}>
                              {lead.businessName}
                            </span>
                            {lead.rating != null && (
                              <span className="inline-flex items-center gap-0.5 font-bold text-xs text-live shrink-0 bg-live/10 border border-live/30 px-1.5 py-0.2 rounded">
                                <Star className="h-3 w-3 fill-live text-live" />
                                {lead.rating}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isHere && slot.status === 'PROSPECTING' && (
                              <span className="inline-flex items-center gap-0.5 border border-live/60 bg-live/20 px-1.5 py-0.5 font-mono text-[0.62rem] font-bold text-live uppercase rounded-xs">
                                <Phone className="h-2.5 w-2.5" />
                                {t('prospecting:crm.negotiatingBadge', 'En Negociación')}
                              </span>
                            )}
                            {isHere && (slot.status === 'RESERVED' || slot.status === 'PAID') && (
                              <span className="inline-flex items-center gap-0.5 border border-clear/60 bg-clear/20 px-1.5 py-0.5 font-mono text-[0.62rem] font-bold text-clear uppercase rounded-xs">
                                <CheckCircle className="h-2.5 w-2.5" />
                                {t('prospecting:crm.assigned', 'Asignado')}
                              </span>
                            )}
                            {!isHere && status === 'CONTACTED' && (
                              <span className="inline-flex items-center gap-0.5 border border-live/50 bg-live/15 px-1.5 py-0.5 font-mono text-[0.62rem] font-bold text-live uppercase rounded-xs">
                                <Phone className="h-2.5 w-2.5" />
                                {t('prospecting:crm.contactedBadge', 'Contactado')}
                              </span>
                            )}
                            <span className="shrink-0 border border-border bg-secondary/80 px-2 py-0.5 font-mono text-[0.62rem] text-secondary-foreground font-semibold rounded-xs">
                              {lead.source}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {lead.phone && (
                            <a
                              href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}
                              className="inline-flex items-center gap-1 font-mono text-xs font-bold text-live hover:underline"
                            >
                              <Phone className="h-3 w-3" />
                              {lead.phone}
                            </a>
                          )}
                          {lead.websiteUrl && (
                            <a
                              href={lead.websiteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                              title={lead.websiteUrl}
                            >
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate max-w-[140px]">
                                {lead.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                              </span>
                            </a>
                          )}
                          <span className="flex items-center gap-0.5 truncate text-xs text-muted-foreground">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate max-w-[150px]">{lead.city || lead.address}</span>
                          </span>
                        </div>
                      </div>

                      {currentHook && (
                        <div className="flex-1 my-2 border border-border/70 bg-secondary/35 px-2.5 py-2 rounded-md flex flex-col justify-center">
                          <div className="flex items-center justify-between mb-1">
                            <span className="flex items-center gap-1.5 font-mono text-[0.68rem] font-bold text-primary">
                              <Sparkles className="h-3 w-3" />
                              {t('canvas:inspector.hook')}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyPitch(lead)}
                              className="flex items-center gap-1 text-[0.65rem] text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer bg-background/50 hover:bg-background px-1.5 py-0.5 rounded border border-border/50"
                            >
                              {copiedId === lead.id ? (
                                <>
                                  <Check className="h-3 w-3 text-clear" />
                                  <span className="text-clear font-semibold">{t('prospecting:llama.copied')}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>{t('prospecting:llama.copyPitch')}</span>
                                </>
                              )}
                            </button>
                          </div>
                          <p className="line-clamp-3 text-[0.72rem] leading-relaxed text-foreground/90 italic">
                            "{currentHook}"
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-1.5 pt-1 mt-auto">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleContactLead(lead)}
                            disabled={isPaid || isSaving || (isHere && slot.status === 'PROSPECTING')}
                            title={t('prospecting:crm.contactedActive')}
                            className={`h-7.5 border px-2.5 text-xs font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer ${
                              isHere && slot.status === 'PROSPECTING'
                                ? 'border-live bg-live/25 text-live font-bold ring-1 ring-live/60'
                                : status === 'CONTACTED'
                                  ? 'border-live/60 bg-live/15 text-live font-semibold'
                                  : 'border-border text-secondary-foreground hover:bg-secondary hover:text-foreground'
                            }`}
                          >
                            <Phone className="h-2.5 w-2.5" />
                            <span>
                              {isHere && slot.status === 'PROSPECTING'
                                ? t('prospecting:crm.negotiatingInSlot', { slot: slot.displayNumber ?? slot.slotNumber })
                                : t('prospecting:crm.contacted')}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectLead(lead)}
                            disabled={isPaid || isSaving}
                            className={`h-7.5 border px-2.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                              status === 'REJECTED'
                                ? 'border-due/40 bg-due/15 text-due font-semibold'
                                : 'border-border text-secondary-foreground hover:bg-secondary hover:text-foreground'
                            }`}
                          >
                            {t('prospecting:crm.rejected')}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAssign(lead)}
                          disabled={isPaid || (isHere && slot.status === 'RESERVED') || isSaving}
                          className={`flex h-7.5 items-center gap-1.5 px-3 text-xs font-bold rounded transition-colors disabled:opacity-40 cursor-pointer shadow-xs ${
                            isHere && slot.status === 'RESERVED'
                              ? 'bg-clear text-background'
                              : isHere && slot.status === 'PROSPECTING'
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90 ring-1 ring-primary'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90'
                          }`}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span>
                            {isHere && slot.status === 'RESERVED'
                              ? t('prospecting:crm.assigned')
                              : isHere && slot.status === 'PROSPECTING'
                                ? t('canvas:inspector.reserve', 'Apartar / Reservar')
                                : t('canvas:inspector.assign', { id: slot.displayNumber ?? slot.slotNumber })}
                          </span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="shrink-0 pt-2.5 pb-1 border-t border-border/70 text-center">
              <button
                type="button"
                onClick={() => setShowManualForm(true)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors underline cursor-pointer font-medium"
              >
                {t('canvas:inspector.manualEntry', '+ Ingresar comercio manualmente sin prospecto')}
              </button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
};

const StatusPill: React.FC<{ status: SlotStatus }> = ({ status }) => {
  const { t } = useTranslation(['common']);
  const skin =
    status === 'PAID'
      ? 'border-clear/40 bg-clear/15 text-clear'
      : status === 'RESERVED'
        ? 'border-due/40 bg-due/15 text-due'
        : status === 'PROSPECTING'
          ? 'border-live/40 bg-live/15 text-live'
          : 'border-border bg-secondary text-muted-foreground';
  return (
    <span className={`border px-2 py-0.5 font-mono text-[0.63rem] font-bold ${skin}`}>
      {t(`common:status.${status.toLowerCase()}`, status)}
    </span>
  );
};
