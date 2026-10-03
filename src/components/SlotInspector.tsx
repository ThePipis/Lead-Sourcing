import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Eraser,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Sparkles,
  Star,
  Unlock,
  X,
  MessageSquare,
} from 'lucide-react';
import { CLOSED_CATEGORIES } from '../data/categories.ts';
import {
  fetchReplacementLead,
  getFullAddress,
  getMapUrl,
  getLeadEmail,
  getRealWebsiteUrl,
  businessKey,
  ContactOutcome,
  ContactRecord,
  fetchContactOutcomes,
  fetchContacts,
  fetchRegenerationReasons,
  QuarantinedBusiness,
  releaseQuarantine,
  searchQuarantine,
  fetchRegenerations,
  recordContact,
  recordRegeneration,
  RegenerationReason,
  RegenerationRecord,
  searchCategoryLeads,
  getCachedCategoryLeads,
  setCachedCategoryLeads,
  updateLeadStatus,
  getCallFollowUpStatus,
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
  isSaving: boolean;
  onClose: () => void;
  onUpdateBusiness: (slotNumber: number, businessName: string, headline?: string) => void;
  onUpdateNotes?: (slotNumber: number, notes: string) => void;
  onUpdateStatus: (slotNumber: number, status: SlotStatus) => void;
  onReactivateOffer?: (slotNumber: number) => void;
  onSwapSlots: (source: number, target: number) => void;
  onClearSlot: (slotNumber: number) => void;
  onUndoPayment: (slotNumber: number, targetStatus?: SlotStatus, clearBusiness?: boolean) => void;
  onAssignLead: (slotNumber: number, lead: LeadProspect, targetStatus?: SlotStatus) => void;
  /** A call was just written down; the card's clocks need to be redrawn. */
  onContactRecorded?: () => void;
  /** Collect a part of the price without closing the box. */
  onRequestDeposit?: (slotNumber: number) => void;
  contactsVersion?: number;
}

/** Fecha y hora exacta en que se registró el motivo de descarte (ej. "29 sep, 06:05"). */
function formatRegenDate(iso: string | null, lang: string = 'es'): string {
  if (!iso) return '';
  const hasTz = iso.endsWith('Z') || iso.includes('+') || (iso.lastIndexOf('-') > 10);
  const d = new Date(hasTz ? iso : iso + 'Z');
  const validDate = !Number.isNaN(d.getTime()) ? d : new Date(iso);
  if (Number.isNaN(validDate.getTime())) return '';
  return validDate.toLocaleString(lang.startsWith('en') ? 'en-US' : 'es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "en 15 min", "en 2 h", "mañana", "en 3 días": when the business is due to be called. */
function formatRestDate(iso: string): string {
  const until = new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime();
  if (Number.isNaN(until)) return '';
  const diffMs = until - Date.now();
  if (diffMs <= 0) return 'ya disponible';
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 60) return `en ${Math.max(1, diffMins)} min`;
  const diffHours = Math.round(diffMs / 3600000);
  if (diffHours < 24) return `en ${diffHours} h`;
  const days = Math.round(diffMs / 86400000);
  if (days <= 1) return 'mañana';
  if (days < 45) return `en ${days} días`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "hace 40 min", "hace 3 h", "hace 2 días".
 *
 * The unit follows the gap: minutes matter when somebody said "call me right
 * back", days matter a week later. A fixed unit would read "hace 0 días" on
 * the morning the partner most needs to act.
 */
function elapsedSince(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

/** "28 sep, 14:05": a call needs the hour, not just the day. */
function formatStamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  isSaving,
  onClose,
  onUpdateBusiness,
  onUpdateNotes,
  onUpdateStatus,
  onReactivateOffer,
  onSwapSlots,
  onClearSlot,
  onUndoPayment,
  onAssignLead,
  onContactRecorded,
  onRequestDeposit,
  contactsVersion,
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
  const categoryTicket = slot.avgTicketUsd || niche.avgTicketUsd || 500;

  const hasBusiness = Boolean(slot.businessName && slot.businessName.trim());
  const [showManualForm, setShowManualForm] = useState(false);
  const [showAlternativeProspects, setShowAlternativeProspects] = useState(false);

  const [name, setName] = useState(slot.businessName ?? '');
  const [headline, setHeadline] = useState(slot.offerHeadline ?? '');
  const cachedInitial = getCachedCategoryLeads(targetCity, targetZip, niche.id, campaignId);
  const [leads, setLeads] = useState<LeadProspect[]>(cachedInitial && cachedInitial.length >= 3 ? cachedInitial.slice(0, 3) : []);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(!cachedInitial || cachedInitial.length < 3);
  const [crm, setCrm] = useState<Record<string, LeadProspect['status']>>({});
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

  const initialNotes = slot.notes && !slot.notes.startsWith('Covered by') ? slot.notes : '';
  const [notes, setNotes] = useState(initialNotes);
  const savedNotes = useRef(initialNotes);
  const notesTimer = useRef<number | undefined>(undefined);
  const latestNotesDraft = useRef(initialNotes);
  latestNotesDraft.current = notes;

  const commitNotes = (nextNotes: string) => {
    window.clearTimeout(notesTimer.current);
    notesTimer.current = undefined;
    if (nextNotes === savedNotes.current) return;
    savedNotes.current = nextNotes;
    onUpdateNotes?.(slot.slotNumber, nextNotes);
  };

  const scheduleNotes = (nextNotes: string) => {
    window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(() => commitNotes(nextNotes), AUTOSAVE_MS);
  };

  // Follow the box the operator clicked, and never carry one box's draft into
  // the next one.
  useEffect(() => {
    const isNewSlot = currentSlotNumber.current !== slot.slotNumber;
    currentSlotNumber.current = slot.slotNumber;

    if (isNewSlot) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      window.clearTimeout(notesTimer.current);
      notesTimer.current = undefined;
      setName(slot.businessName ?? '');
      setHeadline(slot.offerHeadline ?? '');
      const currentNotes = slot.notes && !slot.notes.startsWith('Covered by') ? slot.notes : '';
      setNotes(currentNotes);
      saved.current = { name: slot.businessName ?? '', headline: slot.offerHeadline ?? '' };
      savedNotes.current = currentNotes;
      setConfirmingClear(false);
      setShowManualForm(false);
      setShowAlternativeProspects(false);
      setOpenHistoryFor(null);
      setOpenContactFor(null);
    } else {
      if (slot.businessName !== undefined && slot.businessName !== saved.current.name) {
        setName(slot.businessName ?? '');
        saved.current.name = slot.businessName ?? '';
      }
      if (slot.offerHeadline !== undefined && slot.offerHeadline !== saved.current.headline) {
        setHeadline(slot.offerHeadline ?? '');
        saved.current.headline = slot.offerHeadline ?? '';
      }
      if (slot.notes !== undefined && slot.notes !== savedNotes.current && !slot.notes.startsWith('Covered by')) {
        setNotes(slot.notes ?? '');
        savedNotes.current = slot.notes ?? '';
      }
    }

    if (slot.businessName) {
      setJustReleasedName(null);
    }
  }, [slot.slotNumber, slot.businessName, slot.offerHeadline, slot.notes]);

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
      if (notesTimer.current) {
        window.clearTimeout(notesTimer.current);
        if (latestNotesDraft.current !== savedNotes.current) {
          onUpdateNotes?.(currentSlotNumber.current, latestNotesDraft.current);
        }
      }
    };
  }, [onUpdateBusiness, onUpdateNotes]);

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
    const fullLead: LeadProspect = {
      ...lead,
      websiteUrl: getRealWebsiteUrl(lead),
      email: getLeadEmail(lead),
      address: getFullAddress(lead),
    };
    setName(fullLead.businessName);
    setHeadline('');
    saved.current = { name: fullLead.businessName, headline: '' };
    setShowManualForm(false);
    onAssignLead(slot.slotNumber, fullLead, 'RESERVED');
  };

  /**
   * Una llamada no es una adjudicación.
   *
   * Antes, pulsar "Contactado" escribía el nombre del negocio en el espacio.
   * Eso cerraba la casilla sobre un comercio que todavía no había dicho que sí
   * y hacía desaparecer a los otros dos candidatos de la pantalla, justo
   * cuando había que llamarlos a ellos también. Aquí sólo se marca que la
   * casilla está en gestión; el nombre se escribe al apartar, que es cuando
   * alguien se comprometió.
   */
  const markSlotCalling = () => {
    if (isPaid) return;
    if (slot.status === 'VACANT') onUpdateStatus(slot.slotNumber, 'PROSPECTING');
  };

  // ------------------------------------------------------- regeneración
  //
  // Setting a business aside is not rejecting it. The old button wrote the name
  // into a blacklist and the business never came back — in a microzone with one
  // dentist worth having, that is an empty box forever. Here the name stays in
  // the pool, the reason is written down, and the count comes back with it so
  // the next call starts where the last one ended.
  const [regenerations, setRegenerations] = useState<Record<string, RegenerationRecord>>({});
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [openHistoryFor, setOpenHistoryFor] = useState<string | null>(null);
  const [copiedReasonId, setCopiedReasonId] = useState<string | null>(null);
  const historyBubbleRef = useRef<HTMLDivElement | null>(null);
  const [arrowLeft, setArrowLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!openHistoryFor) return;
    const updateArrow = () => {
      const card = historyBubbleRef.current?.parentElement;
      const btn = card?.querySelector<HTMLElement>('[data-history-toggle="true"]');
      if (card && btn && historyBubbleRef.current) {
        const bubbleRect = historyBubbleRef.current.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        const pos = btnRect.left - bubbleRect.left + (btnRect.width / 2) - 6;
        setArrowLeft(Math.max(12, Math.min(bubbleRect.width - 24, pos)));
      }
    };
    updateArrow();
    window.addEventListener('resize', updateArrow);
    return () => window.removeEventListener('resize', updateArrow);
  }, [openHistoryFor]);

  const handleCopyReason = (leadId: string, text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedReasonId(leadId);
    window.setTimeout(() => setCopiedReasonId(null), 2000);
  };

  useEffect(() => {
    if (!openHistoryFor) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        historyBubbleRef.current &&
        !historyBubbleRef.current.contains(target as Node) &&
        !target?.closest('[data-history-toggle]')
      ) {
        setOpenHistoryFor(null);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [openHistoryFor]);

  const [reasonFor, setReasonFor] = useState<LeadProspect | null>(null);
  const [reasonCode, setReasonCode] = useState('NO_CONTESTA');
  const [reasonNote, setReasonNote] = useState('');
  const [customDays, setCustomDays] = useState(30);
  const [contacts, setContacts] = useState<Record<string, ContactRecord>>({});
  const [outcomes, setOutcomes] = useState<ContactOutcome[]>([]);
  const [contactFor, setContactFor] = useState<LeadProspect | null>(null);
  const [outcomeCode, setOutcomeCode] = useState('DEJE_MENSAJE');
  const [contactNote, setContactNote] = useState('');
  const [followUpPreset, setFollowUpPreset] = useState<string>('');
  const [followUpDD, setFollowUpDD] = useState<number>(0);
  const [followUpHH, setFollowUpHH] = useState<number>(0);
  const [followUpMM, setFollowUpMM] = useState<number>(0);

  const handleFollowUpPresetChange = (presetValue: string) => {
    setFollowUpPreset(presetValue);
    if (!presetValue || presetValue === '') {
      setFollowUpDD(0);
      setFollowUpHH(0);
      setFollowUpMM(0);
      return;
    }
    if (presetValue === 'custom') {
      return;
    }
    const mins = Number(presetValue);
    if (Number.isNaN(mins) || mins <= 0) {
      setFollowUpDD(0);
      setFollowUpHH(0);
      setFollowUpMM(0);
      return;
    }
    const d = Math.floor(mins / 1440);
    const rem = mins % 1440;
    const h = Math.floor(rem / 60);
    const m = rem % 60;
    setFollowUpDD(d);
    setFollowUpHH(h);
    setFollowUpMM(m);
  };

  const handleCustomFollowUpChange = (d: number, h: number, m: number) => {
    const validD = Math.max(0, Math.min(99, d));
    const validH = Math.max(0, Math.min(23, h));
    const validM = Math.max(0, Math.min(59, m));
    setFollowUpDD(validD);
    setFollowUpHH(validH);
    setFollowUpMM(validM);

    const total = validD * 1440 + validH * 60 + validM;
    const presets = ['15', '30', '60', '120', '240', '1440', '2880', '4320'];
    if (total === 0) {
      setFollowUpPreset('');
    } else if (presets.includes(String(total))) {
      setFollowUpPreset(String(total));
    } else {
      setFollowUpPreset('custom');
    }
  };

  const daysBoxRef = useRef<HTMLDivElement | null>(null);
  const hoursBoxRef = useRef<HTMLDivElement | null>(null);
  const minutesBoxRef = useRef<HTMLDivElement | null>(null);

  const followUpValuesRef = useRef({ dd: followUpDD, hh: followUpHH, mm: followUpMM });
  followUpValuesRef.current = { dd: followUpDD, hh: followUpHH, mm: followUpMM };

  const handleWheelDelta = useCallback((unit: 'DD' | 'HH' | 'MM', step: number) => {
    const { dd, hh, mm } = followUpValuesRef.current;
    let newD = dd;
    let newH = hh;
    let newM = mm;
    if (unit === 'DD') {
      newD = Math.max(0, Math.min(99, dd + step));
    } else if (unit === 'HH') {
      newH = Math.max(0, Math.min(23, hh + step));
    } else if (unit === 'MM') {
      newM = Math.max(0, Math.min(59, mm + step));
    }
    handleCustomFollowUpChange(newD, newH, newM);
  }, []);

  useEffect(() => {
    if (!contactFor) return;

    const bindWheel = (el: HTMLElement | null, unit: 'DD' | 'HH' | 'MM') => {
      if (!el) return () => {};
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const multiplier = e.shiftKey ? 5 : 1;
        const step = (e.deltaY < 0 ? 1 : -1) * multiplier;
        handleWheelDelta(unit, step);
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
    };

    const cleanD = bindWheel(daysBoxRef.current, 'DD');
    const cleanH = bindWheel(hoursBoxRef.current, 'HH');
    const cleanM = bindWheel(minutesBoxRef.current, 'MM');

    return () => {
      cleanD();
      cleanH();
      cleanM();
    };
  }, [contactFor, handleWheelDelta]);
  const [showQuarantine, setShowQuarantine] = useState(false);
  const [quarantineQuery, setQuarantineQuery] = useState('');
  const [quarantineList, setQuarantineList] = useState<QuarantinedBusiness[]>([]);
  const [releasingKey, setReleasingKey] = useState<string | null>(null);
  const [openContactFor, setOpenContactFor] = useState<string | null>(null);
  const [copiedContactId, setCopiedContactId] = useState<string | null>(null);
  const contactBubbleRef = useRef<HTMLDivElement | null>(null);
  const [contactArrowLeft, setContactArrowLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!openContactFor) return;
    const updateArrow = () => {
      const card = contactBubbleRef.current?.parentElement;
      const btn = card?.querySelector<HTMLElement>('[data-contact-toggle="true"]');
      if (card && btn && contactBubbleRef.current) {
        const bubbleRect = contactBubbleRef.current.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        const pos = btnRect.left - bubbleRect.left + (btnRect.width / 2) - 6;
        setContactArrowLeft(Math.max(12, Math.min(bubbleRect.width - 24, pos)));
      }
    };
    updateArrow();
    window.addEventListener('resize', updateArrow);
    return () => window.removeEventListener('resize', updateArrow);
  }, [openContactFor]);

  const handleCopyContact = (leadId: string, text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedContactId(leadId);
    window.setTimeout(() => setCopiedContactId(null), 2000);
  };

  useEffect(() => {
    if (!openContactFor) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        contactBubbleRef.current &&
        !contactBubbleRef.current.contains(target as Node) &&
        !target?.closest('[data-contact-toggle]')
      ) {
        setOpenContactFor(null);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [openContactFor]);

  const [, setTimerTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTimerTick((v) => v + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const contactOf = (lead: LeadProspect) => contacts[businessKey(lead.businessName)];
  const contactCount = (lead: LeadProspect) => contactOf(lead)?.count ?? 0;
  const contactFollowUp = (lead: LeadProspect) => {
    const last = contactOf(lead)?.last;
    return getCallFollowUpStatus(last?.at, last?.follow_up_at);
  };

  // Autocompleta mientras escribe: 250 ms de calma para no pedir por tecla.
  useEffect(() => {
    if (!showQuarantine) return;
    let alive = true;
    const id = window.setTimeout(() => {
      searchQuarantine(quarantineQuery)
        .then((r) => alive && setQuarantineList(r))
        .catch(() => undefined);
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [showQuarantine, quarantineQuery]);

  const releaseNow = async (name: string) => {
    setReleasingKey(businessKey(name));
    try {
      await releaseQuarantine(name);
      setQuarantineList((prev) => prev.filter((q) => q.business_key !== businessKey(name)));
      // Vuelve a la lista sin esperar a que caduque nada.
      const fresh = await searchCategoryLeads(targetCity, targetZip, niche.id, [], campaignId, 3);
      const top3 = fresh.slice(0, 3);
      setLeads(top3);
      setCachedCategoryLeads(targetCity, targetZip, niche.id, top3, campaignId);
    } catch {
      setLeadsError(t('prospecting:quarantine.failed'));
      window.setTimeout(() => setLeadsError(null), 6000);
    } finally {
      setReleasingKey(null);
    }
  };
  const [reasons, setReasons] = useState<RegenerationReason[]>([]);

  useEffect(() => {
    fetchRegenerationReasons().then(setReasons).catch(() => undefined);
    fetchContactOutcomes().then(setOutcomes).catch(() => undefined);
  }, []);

  // One request for the three cards on screen, not one per card.
  useEffect(() => {
    const topLeads = leads.slice(0, 3);
    if (topLeads.length === 0) return;
    let alive = true;
    fetchRegenerations(topLeads.map((l) => l.businessName))
      .then((r) => alive && setRegenerations(r))
      .catch(() => undefined);
    fetchContacts(topLeads.map((l) => l.businessName))
      .then((c) => alive && setContacts(c))
      .catch(() => undefined);
    setOpenContactFor(null);
    return () => {
      alive = false;
    };
  }, [leads, contactsVersion]);

  const openContact = (lead: LeadProspect) => {
    setContactFor(lead);
    setOutcomeCode('DEJE_MENSAJE');
    setContactNote('');
    // Por defecto el selector no debe seleccionar ningún valor y dejar seleccionar manualmente
    setFollowUpPreset('');
    setFollowUpDD(0);
    setFollowUpHH(0);
    setFollowUpMM(0);
    setOpenHistoryFor(null);
  };

  const confirmContact = async () => {
    const lead = contactFor;
    if (!lead) return;
    setContactFor(null);
    try {
      const totalMinutes = followUpDD * 1440 + followUpHH * 60 + followUpMM;
      const saved = await recordContact({
        businessName: lead.businessName,
        campaignId,
        categoryId: niche.id,
        slotNumber: slot.slotNumber,
        outcomeCode,
        note: contactNote.trim() || undefined,
        followUpMinutes: totalMinutes > 0 ? totalMinutes : 0,
        followUpDays: totalMinutes > 0 ? Number((totalMinutes / 1440).toFixed(4)) : 0,
      });
      setContacts((prev) => ({
        ...prev,
        [businessKey(lead.businessName)]: { count: saved.count, last: saved },
      }));
      markCrm(lead, 'CONTACTED');
      // El espacio queda en "Llamando" sin quedarse con el nombre de nadie:
      // las tres conversaciones siguen vivas y en paralelo.
      markSlotCalling();
      onContactRecorded?.();
    } catch {
      setLeadsError(t('prospecting:contact.failed'));
      window.setTimeout(() => setLeadsError(null), 6000);
    }
  };

  const openRegenerate = (lead: LeadProspect) => {
    setReasonFor(lead);
    setReasonCode('NO_CONTESTA');
    setReasonNote('');
    setOpenHistoryFor(null);
  };

  /**
   * Record the reason, then put a different business in this card's place.
   *
   * The replacement excludes everyone already on screen, so the partner does
   * not get the same three names back in a different order.
   */
  const confirmRegenerate = async () => {
    const lead = reasonFor;
    if (!lead) return;
    setReasonFor(null);
    setRegeneratingId(lead.id);
    try {
      const saved = await recordRegeneration({
        businessName: lead.businessName,
        campaignId,
        categoryId: niche.id,
        slotNumber: slot.slotNumber,
        reasonCode,
        reasonNote: reasonNote.trim() || undefined,
        businessAddress: getFullAddress(lead) || undefined,
        cooldownDays: reasonCode === 'OTRO' ? customDays : undefined,
      });
      setRegenerations((prev) => ({
        ...prev,
        [businessKey(lead.businessName)]: {
          count: saved.count,
          last: {
            reason_code: saved.reason_code,
            reason_label: saved.reason_label,
            reason_note: saved.reason_note,
            at: saved.at,
          },
        },
      }));

      const replacement = await fetchReplacementLead(
        niche.id,
        targetCity,
        targetZip,
        leads.map((l) => l.businessName),
        campaignId,
      );
      if (replacement) {
        setLeads((prev) => {
          const updated = prev.map((l) => (l.id === lead.id ? replacement : l));
          setCachedCategoryLeads(targetCity, targetZip, niche.id, updated, campaignId);
          return updated;
        });
      } else {
        // Nothing left to offer. The card stays as it is rather than going
        // blank: a business with a history is still better than an empty slot.
        setLeadsError(t('prospecting:regen.noReplacement'));
        window.setTimeout(() => setLeadsError(null), 6000);
      }
    } catch {
      setLeadsError(t('prospecting:regen.failed'));
      window.setTimeout(() => setLeadsError(null), 6000);
    } finally {
      setRegeneratingId(null);
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
      // Releasing a box is not a verdict on the business. It goes back into the
      // pool like any other candidate; the only thing remembered is that it was
      // just here, so the list does not offer it again in the same breath.
      setJustReleasedName(releasedName);
    }

    onClearSlot(slot.slotNumber);
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
    const cached = getCachedCategoryLeads(targetCity, targetZip, niche.id, campaignId);
    if (cached && cached.length >= 3) {
      setLeads(cached.slice(0, 3));
      setLoadingLeads(false);
      return;
    }
    setLoadingLeads(true);
    searchCategoryLeads(targetCity, targetZip, niche.id, [], campaignId, 3)
      .then((data) => {
        if (!alive) return;
        const top3 = data.slice(0, 3);
        setLeads(top3);
        setCachedCategoryLeads(targetCity, targetZip, niche.id, top3, campaignId);
        setLoadingLeads(false);
      })
      .catch(() => alive && setLoadingLeads(false));
    return () => {
      alive = false;
    };
  }, [targetCity, targetZip, niche.id, campaignId]);

  const markCrm = (lead: LeadProspect, status: 'CONTACTED') => {
    setCrm((prev) => ({ ...prev, [lead.id]: status }));
    updateLeadStatus(lead.id, status).catch(() => undefined);
  };

  return (
    <aside
      ref={panel}
      id="slot-inspector"
      aria-label={t('canvas:inspector.aria', { id: slot.displayNumber ?? slot.slotNumber })}
      className="relative flex h-full min-h-0 flex-col border border-border/80 bg-card text-card-foreground shadow-sm overscroll-contain"
    >
      {/* ---------------------------------------------------------- header compacto */}
      <div className="shrink-0 flex items-center justify-between border-b border-border bg-secondary/50 px-3 py-1.5">
        <span className="font-mono text-xs font-bold text-primary flex items-center gap-1.5 min-w-0">
          <span className="shrink-0">{t('canvas:inspector.slotLabel', { id: slot.displayNumber ?? slot.slotNumber })}</span>
          <span className="text-muted-foreground/60 shrink-0">·</span>
          <span className="font-sans font-semibold text-foreground text-xs truncate">{nicheName}</span>
          {categoryTicket != null && (
            <>
              <span className="text-muted-foreground/60 shrink-0">·</span>
              <span
                className="font-mono text-[0.68rem] font-bold text-foreground/80 shrink-0"
                title={`Ticket promedio de la categoría: $${categoryTicket.toLocaleString()}`}
              >
                Ticket: ${categoryTicket.toLocaleString()}
              </span>
            </>
          )}
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
          <div className="flex flex-col min-h-0">
            {/* ------------------------------------------------- the ad itself */}
            <section className="space-y-2 border-b border-border px-3 py-2 shrink-0">
              <div className="flex items-center justify-between shrink-0">
                <h3 className="field-label">{t('canvas:inspector.adSection')}</h3>
                <StatusPill status={slot.status} />
              </div>

              {isPaid && (
                <div className="flex items-start justify-between gap-2 border border-clear/50 bg-clear/10 px-2.5 py-1.5 text-xs leading-relaxed text-clear shrink-0">
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

              <label className="block shrink-0">
                <span className="field-label">{t('canvas:modal.businessNameLabel')}</span>
                <input
                  id="inspector-business-name"
                  type="text"
                  value={name}
                  // El nombre viene de la fuente y es la clave por la que se
                  // cuentan intentos, desestimos y cuarentena. Reescribirlo
                  // aquí rompería ese hilo sin avisar: el mismo comercio
                  // pasaría a ser otro para el historial. Solo se escribe en
                  // el alta manual, donde todavía no hay historial que romper.
                  readOnly={hasBusiness}
                  title={hasBusiness ? t('prospecting:crm.nameLocked') : undefined}
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
                  className="mt-0.5 w-full border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-live focus:outline-none read-only:cursor-default read-only:bg-secondary/40 read-only:text-ink-dim"
                />
              </label>

              <label className="block shrink-0">
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
                          ? ' [Grande 2×2 · 5.6"×3.6"]'
                          : s.format === 'MEDIUM'
                          ? ' [Mediano 1×2 · 2.8"×3.6"]'
                          : ' [Chico 1×1 · 2.8"×1.8"]';
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

              {/* Comentarios de la separación / conversación con el cliente */}
              {!isPaid && slot.status === 'RESERVED' && (
                <div className="border border-border/80 bg-secondary/35 p-2.5 rounded-md space-y-1.5 shadow-2xs mt-1.5">
                  <div className="flex items-center justify-between gap-1.5 shrink-0">
                    <label
                      htmlFor="inspector-reservation-notes"
                      className="flex items-center gap-1.5 font-mono text-xs font-bold text-foreground cursor-pointer truncate"
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Comentarios de la Separación</span>
                    </label>
                    <span className="text-[0.62rem] text-muted-foreground font-mono shrink-0">
                      (Opcional)
                    </span>
                  </div>
                  <textarea
                    id="inspector-reservation-notes"
                    rows={3}
                    value={notes}
                    placeholder="Escribe aquí acuerdos, fecha de saldo o notas de la conversación con el cliente..."
                    onChange={(e) => {
                      setNotes(e.target.value);
                      scheduleNotes(e.target.value);
                    }}
                    onBlur={() => commitNotes(notes)}
                    className="w-full resize-none border border-border bg-background px-2.5 py-1.5 text-xs leading-relaxed text-foreground focus:border-live focus:outline-none rounded-xs transition-all placeholder:text-muted-foreground/50"
                  />
                </div>
              )}

              {showManualForm && !hasBusiness && !isPaid && (
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="text-xs text-muted-foreground hover:text-foreground underline pt-0.5 shrink-0"
                >
                  ← Volver a lista de prospectos
                </button>
              )}
            </section>

            {/* --------------------------------------------- where the sale is */}
            <section className="space-y-2.5 border-b border-border px-3 py-3">
              <h3 className="field-label">{t('canvas:inspector.stateSection')}</h3>
              <p className="text-[0.67rem] leading-relaxed text-muted-foreground">
                {t('canvas:inspector.stateHint')}
              </p>
              <div className="flex flex-wrap gap-2.5">
                {isPaid ? (
                  <div className="flex flex-col gap-2.5 w-full">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        id="btn-inspector-undo-payment"
                        type="button"
                        onClick={() => onUndoPayment(slot.slotNumber, 'RESERVED', false)}
                        disabled={isSaving}
                        className="flex-1 min-h-10 border border-live/70 bg-live/10 px-3 text-xs font-bold text-live transition-colors hover:bg-live hover:text-background disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer"
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
                        className="flex-1 min-h-10 border border-due bg-due/10 px-3 text-xs font-bold text-due transition-colors hover:bg-due hover:text-background disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer"
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
                      <div className="col-span-full w-full p-3 bg-amber-500/10 border border-amber-500/30 rounded space-y-3 mb-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-300 text-[0.75rem]">
                            <Clock className="h-4 w-4" />
                            {isReservationExpired(slot)
                              ? '🚨 Reserva 72h Vencida'
                              : `⏳ Expira en: ${formatReservationCountdown(slot)}`}
                          </span>
                          <span className="font-mono font-bold text-xs bg-amber-500/20 px-2 py-1 rounded text-amber-700 dark:text-amber-300">
                            <span className="line-through text-muted-foreground mr-1.5">${getSlotReservationInfo(slot).listPrice}</span>
                            ${getSlotDiscountedPrice(slot)} (-${getSlotReservationInfo(slot).discountUsd})
                          </span>
                        </div>

                        {/* Separar con seña.
                            Medio pago no cierra la casilla, pero sí la
                            compromete: hay una diferencia real entre "dijo
                            que sí" y "puso dinero", y es la que decide a
                            quién se deja de llamar. */}
                        {(() => {
                          const price = getSlotDiscountedPrice(slot) || slot.priceUsd || 0;
                          const paid = slot.amountCollectedUsd || 0;
                          const half = Math.round(price / 2);
                          return (
                            <div className="flex items-center justify-between gap-2 border-t border-amber-500/30 pt-3">
                              <span className="font-mono text-[0.7rem] font-medium text-amber-700 dark:text-amber-300">
                                {paid > 0
                                  ? `Abonado $${paid} de $${price} · falta $${Math.max(0, price - paid)}`
                                  : 'Sin abono registrado'}
                              </span>
                              {onRequestDeposit && paid < price && (
                                <button
                                  id="btn-inspector-deposit"
                                  type="button"
                                  onClick={() => onRequestDeposit(slot.slotNumber)}
                                  disabled={isSaving || !slot.businessName}
                                  className="shrink-0 rounded border border-due px-3 py-1.5 text-[0.7rem] font-bold text-due transition-colors hover:bg-due hover:text-background disabled:opacity-40 cursor-pointer"
                                  title="Registrar un abono parcial: separa el espacio sin cerrarlo"
                                >
                                  {paid > 0 ? 'Registrar otro abono' : `Abonar 50% ($${half})`}
                                </button>
                              )}
                            </div>
                          );
                        })()}

                        <div className="flex items-center gap-2 pt-1">
                          {onReactivateOffer && (
                            <button
                              type="button"
                              onClick={() => onReactivateOffer(slot.slotNumber)}
                              disabled={isSaving}
                              className="flex-1 py-2 px-2 bg-live text-primary-foreground font-bold text-xs rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-1 cursor-pointer"
                              title="Renovar 72 horas más y asegurar tarifa con descuento"
                            >
                              <RotateCcw className="h-4 w-4" />
                              <span>Reactivar Oferta (-${getSlotReservationInfo(slot).discountUsd})</span>
                            </button>
                          )}
                          <button
                            id="btn-inspector-mark-paid"
                            type="button"
                            onClick={() => onUpdateStatus(slot.slotNumber, 'PAID')}
                            disabled={isSaving || !slot.businessName}
                            className="flex-1 py-2 px-2 bg-clear text-primary-foreground font-black text-xs rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-1 cursor-pointer"
                            title="Registrar cobro y sellar slot como pagado"
                          >
                            <CheckCircle className="h-4 w-4" />
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
          </div>
        ) : (
          /* ------------------------------------------------- who to call (VACANT / PROSPECTS FIRST) */
          <section className="flex-1 flex flex-col justify-between p-3 min-h-0 h-full">
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
              <ul className="flex-1 flex flex-col gap-2.5 sm:gap-3 min-h-0 h-full">
                {leads.slice(0, 3).map((lead, idx) => {
                  const status = crm[lead.id] ?? lead.status;
                  const isHere = slot.businessName === lead.businessName;
                  // Only what was released a moment ago, and only until the
                  // panel is reopened. Nothing is barred for good any more.
                  const isBlocked =
                    justReleasedName !== null &&
                    lead.businessName.trim().toLowerCase() === justReleasedName.trim().toLowerCase();

                  if (isBlocked) {
                    return (
                      <li
                        key={lead.id}
                        className="flex-1 min-h-[170px] flex flex-col justify-between border border-due/40 bg-due/5 p-3 sm:p-3.5 text-xs transition-colors rounded-md"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-muted-foreground">
                                #{idx + 1}
                              </span>
                              <span className="truncate font-semibold text-xs text-muted-foreground line-through">
                                {lead.businessName}
                              </span>
                            </p>
                            <p className="mt-0.5 text-[0.68rem] text-muted-foreground truncate" title={`${lead.address}, ${lead.city}`}>
                              {lead.address}, {lead.city}
                            </p>
                          </div>
                          <span className="shrink-0 inline-flex items-center gap-1 border border-due/40 bg-due/15 px-1.5 py-0.5 font-mono text-[0.6rem] font-bold text-due uppercase rounded-xs">
                            <Lock className="h-2.5 w-2.5" />
                            {t('prospecting:crm.blocked', 'Desestimó')}
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
                            // Pasa por el mismo diálogo que Desestimo: sin
                            // motivo no hay cuarentena, y sin cuarentena el
                            // comercio vuelve a salir en la próxima búsqueda
                            // como si no hubiera pasado nada.
                            onClick={() => openRegenerate(lead)}
                            disabled={replacingId === lead.id || isSaving || regeneratingId === lead.id}
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

                  const websiteUrl = getRealWebsiteUrl(lead);
                  const email = getLeadEmail(lead);
                  const fullAddress = getFullAddress(lead);

                  return (
                    <li
                      key={lead.id}
                      className={`relative flex-1 min-h-[170px] flex flex-col justify-between border p-2.5 sm:p-3 text-xs transition-colors rounded-md shadow-2xs gap-2 ${
                        isHere
                          ? slot.status === 'PROSPECTING'
                            ? 'border-live bg-live/10 ring-1 ring-live/40 shadow-xs'
                            : 'border-clear bg-clear/10 ring-1 ring-clear/40 shadow-xs'
                          : status === 'CONTACTED'
                            ? 'border-live/50 bg-live/5'
                            : 'border-border/90 bg-card hover:border-rule-strong hover:shadow-xs'
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0">
                        {/* 1. Encabezado con ranking y estrellas fijadas a la derecha */}
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-mono text-xs font-black text-primary px-1.5 py-0.5 rounded-xs bg-primary/10 border border-primary/20 shrink-0">
                            #{idx + 1}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0 ml-1">
                            {lead.rating != null && (
                              <span
                                className="inline-flex items-center gap-1 font-bold text-xs text-live shrink-0 bg-live/10 border border-live/30 px-1.5 py-0.5 rounded"
                                title={`${lead.rating} estrellas (${lead.reviewCount || 0} reseñas)`}
                              >
                                <Star className="h-3 w-3 fill-live text-live" />
                                <span>{lead.rating}</span>
                                {lead.reviewCount ? (
                                  <span className="text-[0.65rem] opacity-80 font-normal">({lead.reviewCount})</span>
                                ) : null}
                              </span>
                            )}
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
                            <span className="shrink-0 border border-border bg-secondary/80 px-2 py-0.5 font-mono text-[0.62rem] text-secondary-foreground font-semibold rounded-xs">
                              {lead.source}
                            </span>
                          </div>
                        </div>

                        {/* Teléfono: debajo del # y encima del nombre del negocio */}
                        {lead.phone && (
                          <div className="flex items-center min-w-0">
                            <a
                              href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}
                              className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-live hover:underline"
                              title={`Llamar al ${lead.phone}`}
                            >
                              <Phone className="h-3.5 w-3.5 shrink-0" />
                              <span>{lead.phone}</span>
                            </a>
                          </div>
                        )}

                        {/* 2. Nombre del negocio completo (ancho total sin truncar) */}
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-foreground leading-snug" title={lead.businessName}>
                            {lead.businessName}
                          </h4>
                        </div>

                        {/* 3. Correo electrónico */}
                        {email && (
                          <div className="flex items-center gap-1 text-xs min-w-0">
                            <a
                              href={`mailto:${email}`}
                              className="inline-flex items-center gap-1 font-mono text-xs text-primary/90 hover:text-primary hover:underline min-w-0"
                              title={`Enviar correo a: ${email}`}
                            >
                              <Mail className="h-3 w-3 shrink-0 text-primary" />
                              <span className="truncate">{email}</span>
                            </a>
                          </div>
                        )}

                        {/* Un campo ausente es un dato. Omitirlo deja al
                            vendedor sin saber si el comercio no publica correo
                            o si el sistema no supo encontrarlo. */}
                        {!email && (
                          <div className="pt-0.5">
                            <div
                              title={t(
                                'prospecting:crm.noEmailOpportunityTitle',
                                'Comercio sin correo publicado: prospección vía telefónica o buzoneo físico prioritario.',
                              )}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-live/70 bg-live/15 text-live font-mono text-[0.68rem] font-bold uppercase tracking-wide rounded-xs shadow-2xs select-none"
                            >
                              <Mail className="h-3 w-3 shrink-0 text-live" />
                              <span>{t('prospecting:crm.noEmail')}</span>
                              <span className="border-l border-live/35 pl-1.5 ml-0.5 text-[0.6rem] font-sans font-semibold tracking-normal normal-case text-live/90">
                                {t('prospecting:crm.noEmailOpportunity', 'Llamada directa')}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* 3. URL Real del Sitio Web (Carga en nueva pestaña con target="_blank") */}
                        {websiteUrl && (
                          <div className="flex items-center gap-1 text-xs min-w-0">
                            <a
                              href={websiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline hover:text-primary/80 transition-colors font-medium min-w-0"
                              title={
                                lead.websiteOk === false
                                  ? `${websiteUrl} no responde. Compruébalo antes de enseñárselo al comercio.`
                                  : lead.websiteSource === 'inferido'
                                    ? `Ninguna fuente dio la web de este comercio. ${websiteUrl} se dedujo de su nombre y sí responde, pero una búsqueda independiente no lo corroboró: ábrela antes de usarla.`
                                    : lead.websiteSource === 'confirmado'
                                      ? `${websiteUrl} se dedujo del nombre y una búsqueda independiente la devolvió para este comercio. Dos caminos distintos coinciden.`
                                      : `Abrir sitio web oficial en nueva pestaña: ${websiteUrl}`
                              }
                            >
                              <Globe className="h-3 w-3 shrink-0 text-primary" />
                              <span className="truncate">
                                {websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                                {lead.websiteOk === false && (
                                  <span className="ml-1 text-due font-semibold">(página caída)</span>
                                )}
                                {lead.websiteOk !== false && lead.websiteSource === 'inferido' && (
                                  <span className="ml-1 text-muted-foreground/70">(inferido)</span>
                                )}
                                {lead.websiteOk !== false && lead.websiteSource === 'confirmado' && (
                                  <span className="ml-1 text-clear/80">(confirmado)</span>
                                )}
                              </span>
                              <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" />
                            </a>
                          </div>
                        )}

                        {!websiteUrl && (
                          <div className="pt-0.5">
                            <div
                              title={t(
                                'prospecting:crm.noWebsiteOpportunityTitle',
                                'Comercio sin web propia: candidato prioritario con alta receptividad a buzoneo físico (EDDM).',
                              )}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-live/70 bg-live/15 text-live font-mono text-[0.68rem] font-bold uppercase tracking-wide rounded-xs shadow-2xs select-none"
                            >
                              <Sparkles className="h-3 w-3 shrink-0 text-live" />
                              <span>{t('prospecting:crm.noWebsite')}</span>
                              <span className="border-l border-live/35 pl-1.5 ml-0.5 text-[0.6rem] font-sans font-semibold tracking-normal normal-case text-live/90">
                                {t('prospecting:crm.noWebsiteOpportunity', 'Objetivo directo')}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* 4. Dirección completa real (con enlace a Google Maps en nueva pestaña) */}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                          <a
                            href={getMapUrl(lead)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 min-w-0 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                            title={
                              lead.hasStreetAddress === false
                                ? 'Este comercio no tiene dirección registrada: trabaja a domicilio. El mapa apunta a las coordenadas que lo situaron en la microzona.'
                                : `Ver dirección completa en Google Maps: ${fullAddress}`
                            }
                          >
                            <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/80 group-hover:text-live transition-colors" />
                            <span className="truncate">
                              {lead.hasStreetAddress === false
                                ? `${fullAddress || 'Sin dirección'} · sin local (a domicilio)`
                                : fullAddress}
                            </span>
                            <ExternalLink className="h-2 w-2 shrink-0 opacity-50 group-hover:opacity-100" />
                          </a>
                        </div>

                      </div>

                      {/* 6. Botones de acción */}
                      <div className="flex items-center justify-between gap-1.5 pt-1.5 mt-auto border-t border-border/50">
                        <div className="flex items-center gap-1.5">
                          {/* Contactar, y el aviso de que hace falta volver.
                              El botón es la alarma: cuando el día prometido
                              llegó, se enciende y dice cuánto tiempo lleva sin
                              tocarse. Una franja aparte gastaba una fila entera
                              para decir lo mismo. La burbuja cuenta los
                              intentos, igual que en Desestimo, y al pulsarla
                              sale lo último que pasó. Nada de esto manda al
                              comercio a cuarentena: todavía no hubo
                              conversación, y ahí es donde está la oportunidad. */}
                          <span className="flex items-center">
                            {(() => {
                              const followUp = contactFollowUp(lead);
                              const hasCalls = contactCount(lead) > 0;
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openContact(lead)}
                                    disabled={isPaid || isSaving || (isHere && slot.status === 'PROSPECTING')}
                                    title={
                                      followUp.isDue
                                        ? t('prospecting:contact.overdueTitle', {
                                            since: followUp.overdueSince,
                                          })
                                        : followUp.isScheduledFuture
                                          ? `Llamada programada: ${followUp.badgeText}. Abre para registrar contacto.`
                                          : t('prospecting:crm.contactedActive')
                                    }
                                    className={`h-7.5 border px-2.5 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                                      hasCalls ? 'rounded-l' : 'rounded'
                                    } ${
                                      followUp.isDue
                                        ? followUp.isOverdue1h
                                          ? 'border-due bg-due text-white font-bold animate-pulse shadow-[0_0_10px_rgba(226,85,68,0.55)]'
                                          : 'border-live bg-live text-primary-foreground font-bold animate-pulse shadow-[0_0_10px_rgba(217,164,65,0.55)]'
                                        : followUp.isScheduledFuture
                                          ? 'border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold hover:bg-amber-500/25'
                                          : isHere && slot.status === 'PROSPECTING'
                                            ? 'border-live bg-live/25 text-live font-bold ring-1 ring-live/60'
                                            : status === 'CONTACTED'
                                              ? 'border-live/60 bg-live/15 text-live font-semibold'
                                              : 'border-border text-secondary-foreground hover:bg-secondary hover:text-foreground'
                                    }`}
                                  >
                                    <Phone className="h-2.5 w-2.5 shrink-0" />
                                    <span className="whitespace-nowrap flex items-center gap-1">
                                      {followUp.isDue
                                        ? t('prospecting:contact.overdue', { since: followUp.overdueSince })
                                        : followUp.isScheduledFuture
                                          ? followUp.badgeText.charAt(0).toUpperCase() + followUp.badgeText.slice(1)
                                          : isHere && slot.status === 'PROSPECTING'
                                            ? t('prospecting:crm.negotiatingInSlot', {
                                                slot: slot.displayNumber ?? slot.slotNumber,
                                              })
                                            : t('prospecting:crm.contacted')}
                                      {followUp.isDue && followUp.isOverdue1h && (
                                        <AlertCircle className="h-3 w-3 shrink-0 text-white stroke-[2.5]" />
                                      )}
                                    </span>
                                  </button>
                                  {hasCalls && (
                                    <button
                                      type="button"
                                      data-contact-toggle="true"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenHistoryFor(null);
                                        setOpenContactFor(
                                          openContactFor === lead.id ? null : lead.id,
                                        );
                                      }}
                                      title={t('prospecting:contact.countTitle', {
                                        count: contactCount(lead),
                                      })}
                                      aria-expanded={openContactFor === lead.id}
                                      className={`h-7.5 rounded-r border border-l-0 px-1.5 font-mono text-[0.68rem] font-bold transition-colors cursor-pointer ${
                                        followUp.isDue
                                          ? followUp.isOverdue1h
                                            ? 'border-due bg-due/25 text-due'
                                            : 'border-live bg-live/25 text-live'
                                          : followUp.isScheduledFuture
                                            ? 'border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25'
                                            : 'border-live/50 bg-live/10 text-live hover:bg-live/20'
                                      }`}
                                    >
                                      ×{contactCount(lead)}
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                          </span>
                          {/* Set this one aside and bring another.
                              Not a rejection: the business stays in the pool
                              and comes back with its history attached, because
                              a microzone has one dentist worth having and "not
                              this month" is not "never". The counter is the
                              history — clicking it reads out what happened the
                              last time somebody called. */}
                          <span className="flex items-center">
                            <button
                              type="button"
                              onClick={() => openRegenerate(lead)}
                              disabled={isPaid || isSaving || regeneratingId === lead.id}
                              title={t('prospecting:regen.buttonTitle')}
                              className={`flex h-7.5 items-center justify-center gap-1 border border-border px-2 text-xs font-semibold text-secondary-foreground transition-colors cursor-pointer hover:bg-secondary hover:text-foreground disabled:opacity-40 ${(regenerations[businessKey(lead.businessName)]?.count ?? 0) > 0 ? 'rounded-l' : 'rounded'}`}
                            >
                              <span>{t('prospecting:regen.button', 'Otro')}</span>
                              <RotateCcw
                                className={`h-3 w-3 shrink-0 ${regeneratingId === lead.id ? 'animate-spin' : ''}`}
                              />
                            </button>
                            {(regenerations[businessKey(lead.businessName)]?.count ?? 0) > 0 && (
                              <button
                                type="button"
                                data-history-toggle="true"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenContactFor(null);
                                  setOpenHistoryFor(
                                    openHistoryFor === lead.id ? null : lead.id,
                                  );
                                }}
                                title={t('prospecting:regen.countTitle')}
                                aria-expanded={openHistoryFor === lead.id}
                                className="h-7.5 rounded-r border border-l-0 border-due/50 bg-due/10 px-1.5 font-mono text-[0.68rem] font-bold text-due transition-colors cursor-pointer hover:bg-due/20"
                              >
                                ×{regenerations[businessKey(lead.businessName)]?.count}
                              </button>
                            )}
                          </span>
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
                                : t('canvas:inspector.assign', 'Asignar')}
                          </span>
                        </button>
                      </div>

                      {/* Burbuja flotante emergente con detalle de último contacto (sin desplazamiento del card) */}
                      {openContactFor === lead.id && contacts[businessKey(lead.businessName)]?.last && (() => {
                        const contactRecord = contacts[businessKey(lead.businessName)]!;
                        const lastContact = contactRecord.last!;
                        const fullContactToCopy = lastContact.note
                          ? `${lastContact.outcome_label}: ${lastContact.note}`
                          : lastContact.outcome_label;
                        const isCopied = copiedContactId === lead.id;

                        return (
                          <div
                            ref={contactBubbleRef}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute bottom-12 left-2 right-2 z-40 rounded-lg border border-live/50 bg-card shadow-xl"
                          >
                            <div className="relative rounded-lg bg-live/10 p-2.5 text-xs">
                              {/* Encabezado: Título + Fecha/Hora + Botón X para cerrar */}
                              <div className="flex items-center justify-between pb-1.5 border-b border-live/25">
                                <span className="font-semibold text-live text-[0.72rem] tracking-tight">
                                  {t('prospecting:contact.historyTitle', 'Último contacto')}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[0.62rem] text-live/80 whitespace-nowrap">
                                    {formatRegenDate(lastContact.at, i18n.language)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setOpenContactFor(null)}
                                    title="Cerrar"
                                    className="rounded p-0.5 text-live hover:bg-live/20 transition-colors cursor-pointer"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Resultado y nota clickeable para copiar en un clic */}
                              <div
                                onClick={(e) => handleCopyContact(lead.id, fullContactToCopy, e)}
                                title="Clic para copiar nota de contacto"
                                className="mt-2 group flex items-start justify-between gap-2 p-1.5 rounded border border-live/30 bg-live/5 hover:bg-live/15 transition-all cursor-pointer"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-live text-[0.72rem] leading-tight">
                                    {lastContact.outcome_label}
                                  </p>
                                  {lastContact.note && (
                                    <p className="mt-1 text-[0.68rem] text-foreground/90 italic leading-snug">
                                      “{lastContact.note}”
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0 pt-0.5">
                                  {isCopied ? (
                                    <span className="flex items-center gap-1 text-[0.65rem] font-bold text-live bg-live/20 px-1.5 py-0.5 rounded">
                                      <Check className="h-3 w-3" /> ¡Copiado!
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[0.65rem] font-medium text-live/80 group-hover:text-live bg-live/10 px-1.5 py-0.5 rounded transition-colors">
                                      <Copy className="h-3 w-3" /> Copiar
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Fila inferior: Próxima llamada programada y contador de intentos */}
                              <div className="mt-2 flex items-center justify-between pt-1 border-t border-live/15 text-[0.62rem] font-mono text-muted-foreground">
                                {lastContact.follow_up_at ? (() => {
                                  const bubbleFollowUp = getCallFollowUpStatus(lastContact.at, lastContact.follow_up_at);
                                  const isUrgentDue = bubbleFollowUp.isDue && bubbleFollowUp.isOverdue1h;
                                  return (
                                    <span className={`flex items-center gap-1 ${
                                      isUrgentDue
                                        ? 'text-due font-bold animate-pulse'
                                        : bubbleFollowUp.isDue
                                          ? 'text-live font-semibold animate-pulse'
                                          : 'text-live/90'
                                    }`}>
                                      {bubbleFollowUp.isDue
                                        ? `Atrasada (${bubbleFollowUp.badgeText})`
                                        : bubbleFollowUp.isScheduledFuture
                                          ? `Próxima: ${bubbleFollowUp.badgeText}`
                                          : t('prospecting:contact.nextCall', {
                                              when: formatRestDate(lastContact.follow_up_at),
                                            })}
                                      {isUrgentDue && (
                                        <AlertCircle className="h-3 w-3 shrink-0 text-due stroke-[2.5]" />
                                      )}
                                    </span>
                                  );
                                })() : (
                                  <span />
                                )}
                                <span className="rounded bg-live/15 px-1.5 py-0.5 font-bold text-live">
                                  {t('prospecting:contact.attempts', {
                                    count: contactRecord.count,
                                  })}
                                </span>
                              </div>

                              {/* Flecha decorativa apuntando exactamente hacia el botón ×N */}
                              <div
                                className="absolute -bottom-1.5 h-3 w-3 rotate-45 border-b border-r border-live/50 bg-card overflow-hidden transition-[left] duration-150"
                                style={{ left: contactArrowLeft != null ? `${contactArrowLeft}px` : '90px' }}
                              >
                                <div className="w-full h-full bg-live/10" />
                              </div>
                            </div>
                          </div>
                        );
                      })()}

      {openHistoryFor === lead.id && regenerations[businessKey(lead.businessName)]?.last && (() => {
                        const lastRegen = regenerations[businessKey(lead.businessName)]!.last!;
                        const fullReasonToCopy = lastRegen.reason_note
                          ? `${lastRegen.reason_label}: ${lastRegen.reason_note}`
                          : lastRegen.reason_label;
                        const isCopied = copiedReasonId === lead.id;

                        return (
                          <div
                            ref={historyBubbleRef}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute bottom-12 left-2 right-2 z-40 rounded-lg border border-due/50 bg-card shadow-xl"
                          >
                            <div className="relative rounded-lg bg-due/10 p-2.5 text-xs">
                              {/* Encabezado: Título + Fecha + Botón X para cerrar */}
                              <div className="flex items-center justify-between pb-1.5 border-b border-due/25">
                                <span className="font-semibold text-due text-[0.72rem] tracking-tight">
                                  {t('prospecting:regen.historyTitle', '¿Por qué desestimó?')}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[0.62rem] text-due/80 whitespace-nowrap">
                                    {formatRegenDate(lastRegen.at, i18n.language)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setOpenHistoryFor(null)}
                                    title="Cerrar"
                                    className="rounded p-0.5 text-due hover:bg-due/20 transition-colors cursor-pointer"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Motivo clickeable para copiar en un clic */}
                              <div
                                onClick={(e) => handleCopyReason(lead.id, fullReasonToCopy, e)}
                                title="Clic para copiar motivo"
                                className="mt-2 group flex items-start justify-between gap-2 p-1.5 rounded border border-due/30 bg-due/5 hover:bg-due/15 transition-all cursor-pointer"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-due text-[0.72rem] leading-tight">
                                    {lastRegen.reason_label}
                                  </p>
                                  {lastRegen.reason_note && (
                                    <p className="mt-1 text-[0.68rem] text-foreground/90 italic leading-snug">
                                      “{lastRegen.reason_note}”
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0 pt-0.5">
                                  {isCopied ? (
                                    <span className="flex items-center gap-1 text-[0.65rem] font-bold text-due bg-due/20 px-1.5 py-0.5 rounded">
                                      <Check className="h-3 w-3" /> ¡Copiado!
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[0.65rem] font-medium text-due/80 group-hover:text-due bg-due/10 px-1.5 py-0.5 rounded transition-colors">
                                      <Copy className="h-3 w-3" /> Copiar
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Flecha decorativa apuntando exactamente hacia el botón xN */}
                              <div
                                className="absolute -bottom-1.5 h-3 w-3 rotate-45 border-b border-r border-due/50 bg-card overflow-hidden transition-[left] duration-150"
                                style={{ left: arrowLeft != null ? `${arrowLeft}px` : '215px' }}
                              >
                                <div className="w-full h-full bg-due/10" />
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="shrink-0 pt-2.5 pb-1 border-t border-border/70 text-center mt-2">
              <button
                type="button"
                onClick={() => setShowQuarantine(true)}
                className="mr-3 text-xs text-muted-foreground hover:text-primary transition-colors underline cursor-pointer font-medium"
              >
                {t('prospecting:quarantine.open')}
              </button>
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
      {/* Why this one is being set aside.
          Overlaid on the panel rather than inserted into it, so the three
          cards keep their height and nothing below jumps. The picker closes
          the common cases in one click; the box is for the conversation that
          actually happened, which is what is worth reading in three months. */}
      {reasonFor && (
        <div
          className="absolute inset-0 z-30 flex items-end bg-background/80 backdrop-blur-[2px]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="w-full border-t border-due/50 bg-card p-4 shadow-lg">
            <p className="text-xs font-bold uppercase tracking-wider text-due">
              {t('prospecting:regen.dialogTitle')}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">
              {reasonFor.businessName}
            </p>

            <label className="mt-3 block">
              <span className="field-label">{t('prospecting:regen.reasonLabel')}</span>
              <select
                id="regen-reason-code"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-background px-2 py-2 text-xs text-foreground focus:border-live focus:outline-none"
              >
                {reasons.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                    {r.code === 'OTRO'
                      ? ''
                      : r.cooldown_days == null
                        ? ` (${t('prospecting:regen.permanent')})`
                        : ` (${t('prospecting:regen.days', { count: r.cooldown_days })})`}
                  </option>
                ))}
              </select>
            </label>

            {reasonCode === 'OTRO' && (
              <label className="mt-2.5 block">
                <span className="field-label">{t('prospecting:regen.customDaysLabel')}</span>
                <select
                  id="regen-custom-days"
                  value={customDays}
                  onChange={(e) => setCustomDays(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-border bg-background px-2 py-2 text-xs text-foreground focus:border-live focus:outline-none"
                >
                  {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                    <option key={d} value={d}>
                      {t('prospecting:regen.days', { count: d })}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="mt-2.5 block">
              <span className="field-label">
                {reasonCode === 'OTRO'
                  ? t('prospecting:regen.noteLabelRequired')
                  : t('prospecting:regen.noteLabel')}
              </span>
              <textarea
                id="regen-reason-note"
                rows={3}
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder={t('prospecting:regen.notePlaceholder')}
                className="mt-1 w-full resize-none rounded border border-border bg-background px-2.5 py-2 text-xs leading-relaxed text-foreground focus:border-live focus:outline-none"
              />
            </label>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReasonFor(null)}
                className="h-9 rounded px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
              >
                {t('prospecting:regen.cancel')}
              </button>
              <button
                id="btn-regen-confirm"
                type="button"
                onClick={confirmRegenerate}
                disabled={reasonCode === 'OTRO' && !reasonNote.trim()}
                className="flex h-9 items-center gap-1.5 rounded bg-due px-3.5 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('prospecting:regen.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* La llamada que acaba de ocurrir.
          "Contactado" como bandera no dice nada tres semanas después: quién
          atendió, qué pidieron, cuándo volver. Aquí queda la nota, la hora, y
          el día en que la tarjeta volverá a avisar. */}
      {contactFor && (
        <div
          className="absolute inset-0 z-30 flex items-end bg-background/80 backdrop-blur-[2px]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="w-full border-t border-live/50 bg-card p-4 shadow-lg">
            <p className="text-xs font-bold uppercase tracking-wider text-live">
              {t('prospecting:contact.dialogTitle')}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">
              {contactFor.businessName}
            </p>

            <label className="mt-3 block">
              <span className="field-label">{t('prospecting:contact.outcomeLabel')}</span>
              <select
                id="contact-outcome-code"
                value={outcomeCode}
                onChange={(e) => {
                  setOutcomeCode(e.target.value);
                }}
                className="mt-1 w-full rounded border border-border bg-background px-2 py-2 text-xs text-foreground focus:border-live focus:outline-none"
              >
                {outcomes.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-2.5 block">
              <div className="flex items-center justify-between">
                <span className="field-label">{t('prospecting:contact.followUpLabel', 'Recordarme volver a llamar en')}</span>
                {(followUpDD > 0 || followUpHH > 0 || followUpMM > 0) && (
                  <span className="font-mono text-[0.65rem] text-live font-bold bg-live/10 border border-live/25 px-1.5 py-0.5 rounded-xs">
                    {followUpDD > 0 ? `${followUpDD}d ` : ''}
                    {followUpHH > 0 ? `${followUpHH}h ` : ''}
                    {followUpMM > 0 ? `${followUpMM}m` : ''}
                  </span>
                )}
              </div>
              <div className="mt-1.5 space-y-2">
                {/* 1. Selector rápido con etiqueta "Llamar en..." y tiempos clásicos (ancho completo) */}
                <div>
                  <select
                    id="contact-followup-preset"
                    value={followUpPreset}
                    onChange={(e) => handleFollowUpPresetChange(e.target.value)}
                    className="w-full h-8.5 rounded border border-border bg-background px-2.5 text-xs text-foreground focus:border-live focus:outline-none transition-colors"
                  >
                    <option value="">
                      {t('prospecting:contact.callInPresetPlaceholder', 'Llamar en... (seleccionar)')}
                    </option>
                    <option value="15">En 15 minutos</option>
                    <option value="30">En 30 minutos</option>
                    <option value="60">En 1 hora</option>
                    <option value="120">En 2 horas</option>
                    <option value="240">En 4 horas</option>
                    <option value="1440">Mañana (24 h)</option>
                    <option value="2880">En 2 días</option>
                    <option value="4320">En 3 días</option>
                    {followUpPreset === 'custom' && (
                      <option value="custom">{t('prospecting:contact.customTimeLabel', 'Personalizado (DD:HH:MM)')}</option>
                    )}
                  </select>
                </div>

                {/* 2. Control manual exacto DD : HH : MM debajo (ancho completo con scroll de mouse) */}
                {(() => {
                  const isZeroOrEmpty = !followUpPreset || followUpPreset === '' || (followUpDD === 0 && followUpHH === 0 && followUpMM === 0);
                  const displayDD = isZeroOrEmpty ? '' : String(followUpDD).padStart(2, '0');
                  const displayHH = isZeroOrEmpty ? '' : String(followUpHH).padStart(2, '0');
                  const displayMM = isZeroOrEmpty ? '' : String(followUpMM).padStart(2, '0');

                  return (
                    <div
                      className="flex items-center justify-between min-h-[2.25rem] rounded border border-border bg-background px-3 py-1 text-xs focus-within:border-live transition-colors"
                      title="Tiempo exacto: Días : Horas : Minutos (usa scroll del mouse sobre cada casilla)"
                    >
                      <span className="text-[0.7rem] text-muted-foreground font-medium whitespace-nowrap shrink-0">
                        {t('prospecting:contact.customExactLabel', 'Tiempo exacto:')}
                      </span>
                      <div className="flex items-center gap-1.5 font-mono">
                        {/* Días */}
                        <div
                          ref={daysBoxRef}
                          className="flex items-center gap-1 bg-secondary/60 hover:bg-secondary hover:border-live/60 px-2 py-0.5 rounded border border-border/80 focus-within:border-live transition-all cursor-ns-resize"
                          title="Días: scroll del mouse o flechas arriba/abajo (0-99)"
                        >
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            value={displayDD}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                handleWheelDelta('DD', 1);
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                handleWheelDelta('DD', -1);
                              }
                            }}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, '');
                              const val = raw === '' ? 0 : Math.min(99, parseInt(raw, 10));
                              handleCustomFollowUpChange(val, followUpHH, followUpMM);
                            }}
                            placeholder="00"
                            className="w-6 text-center font-mono text-xs font-bold bg-transparent border-0 p-0 focus:outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ns-resize"
                            title="Días: scroll o flechas (0-99)"
                          />
                          <span className="font-mono text-[0.62rem] text-muted-foreground uppercase font-bold select-none pointer-events-none">d</span>
                        </div>

                        <span className="font-mono text-muted-foreground/50 font-bold select-none">:</span>

                        {/* Horas */}
                        <div
                          ref={hoursBoxRef}
                          className="flex items-center gap-1 bg-secondary/60 hover:bg-secondary hover:border-live/60 px-2 py-0.5 rounded border border-border/80 focus-within:border-live transition-all cursor-ns-resize"
                          title="Horas: scroll del mouse o flechas arriba/abajo (0-23)"
                        >
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            value={displayHH}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                handleWheelDelta('HH', 1);
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                handleWheelDelta('HH', -1);
                              }
                            }}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, '');
                              const val = raw === '' ? 0 : Math.min(23, parseInt(raw, 10));
                              handleCustomFollowUpChange(followUpDD, val, followUpMM);
                            }}
                            placeholder="00"
                            className="w-6 text-center font-mono text-xs font-bold bg-transparent border-0 p-0 focus:outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ns-resize"
                            title="Horas: scroll o flechas (0-23)"
                          />
                          <span className="font-mono text-[0.62rem] text-muted-foreground uppercase font-bold select-none pointer-events-none">h</span>
                        </div>

                        <span className="font-mono text-muted-foreground/50 font-bold select-none">:</span>

                        {/* Minutos */}
                        <div
                          ref={minutesBoxRef}
                          className="flex items-center gap-1 bg-secondary/60 hover:bg-secondary hover:border-live/60 px-2 py-0.5 rounded border border-border/80 focus-within:border-live transition-all cursor-ns-resize"
                          title="Minutos: scroll del mouse o flechas arriba/abajo (0-59)"
                        >
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            value={displayMM}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                handleWheelDelta('MM', 1);
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                handleWheelDelta('MM', -1);
                              }
                            }}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, '');
                              const val = raw === '' ? 0 : Math.min(59, parseInt(raw, 10));
                              handleCustomFollowUpChange(followUpDD, followUpHH, val);
                            }}
                            placeholder="00"
                            className="w-6 text-center font-mono text-xs font-bold bg-transparent border-0 p-0 focus:outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ns-resize"
                            title="Minutos: scroll o flechas (0-59)"
                          />
                          <span className="font-mono text-[0.62rem] text-muted-foreground uppercase font-bold select-none pointer-events-none">m</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <label className="mt-2.5 block">
              <span className="field-label">{t('prospecting:contact.noteLabel')}</span>
              <textarea
                id="contact-note"
                rows={3}
                value={contactNote}
                onChange={(e) => setContactNote(e.target.value)}
                placeholder={t('prospecting:contact.notePlaceholder')}
                className="mt-1 w-full resize-none rounded border border-border bg-background px-2.5 py-2 text-xs leading-relaxed text-foreground focus:border-live focus:outline-none"
              />
            </label>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setContactFor(null)}
                className="h-9 rounded px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
              >
                {t('prospecting:regen.cancel')}
              </button>
              <button
                id="btn-contact-confirm"
                type="button"
                onClick={confirmContact}
                className="flex h-9 items-center gap-1.5 rounded bg-live px-3.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer"
              >
                <Phone className="h-3.5 w-3.5" />
                {t('prospecting:contact.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sacar a alguien del descanso antes de tiempo.
          El reloj lo puso un motivo, pero el vendedor se entera de cosas que el
          reloj no sabe: cambió el dueño, llamaron ellos, se liberó presupuesto.
          Busca mientras escribe, por nombre o por calle, porque quien recuerda
          "el de Limonite" no recuerda la razón social. */}
      {showQuarantine && (
        <div
          className="absolute inset-0 z-30 flex items-end bg-background/80 backdrop-blur-[2px]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex max-h-[80%] w-full flex-col border-t border-border bg-card p-4 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground">
                {t('prospecting:quarantine.title')}
              </p>
              <button
                type="button"
                onClick={() => setShowQuarantine(false)}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {t('prospecting:regen.cancel')}
              </button>
            </div>

            <input
              id="quarantine-search"
              type="text"
              autoFocus
              value={quarantineQuery}
              onChange={(e) => setQuarantineQuery(e.target.value)}
              placeholder={t('prospecting:quarantine.placeholder')}
              className="mt-2.5 w-full rounded border border-border bg-background px-2.5 py-2 text-xs text-foreground focus:border-live focus:outline-none"
            />

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
              {quarantineList.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  {quarantineQuery.trim()
                    ? t('prospecting:quarantine.noMatches')
                    : t('prospecting:quarantine.empty')}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {quarantineList.map((q) => (
                    <li
                      key={q.business_key}
                      className="flex items-center justify-between gap-2 rounded border border-border/70 bg-secondary/30 px-2.5 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {q.business_name}
                        </p>
                        {q.address && (
                          <p className="truncate font-mono text-[0.62rem] text-muted-foreground">
                            {q.address}
                          </p>
                        )}
                        <p className="truncate font-mono text-[0.62rem] text-ink-faint">
                          {q.reason_label}
                          {q.cooldown_until
                            ? ` · ${t('prospecting:regen.restingUntil', {
                                when: formatRestDate(q.cooldown_until),
                              })}`
                            : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => releaseNow(q.business_name)}
                        disabled={releasingKey === q.business_key}
                        className="h-7.5 shrink-0 rounded border border-clear px-2.5 text-[0.68rem] font-bold text-clear transition-colors hover:bg-clear hover:text-background disabled:opacity-40 cursor-pointer"
                      >
                        {t('prospecting:quarantine.release')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {leadsError && (
        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-due bg-due/15 px-4 py-2 text-xs text-due">
          {leadsError}
        </div>
      )}
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
