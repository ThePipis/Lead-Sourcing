import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircleQuestion, Moon, SlidersHorizontal, Sun } from 'lucide-react';
import { CampaignFile } from './components/CampaignFile.tsx';
import { FormShell } from './components/FormShell.tsx';
import { PaymentStamp } from './components/PaymentStamp.tsx';
import { ProductionSection } from './components/ProductionSection.tsx';
import { FinancialMetrics } from './components/FinancialMetrics.tsx';
import { PostalCanvas } from './components/PostalCanvas.tsx';
import { SlotInspector } from './components/SlotInspector.tsx';
import { CurationStudio } from './components/CurationStudio.tsx';
import { PostalExportView } from './components/PostalExportView.tsx';
import { ArchitectureViewer } from './components/ArchitectureViewer.tsx';
import { GuidedTour, FILE_TOUR, FORM_TOUR, hasSeenTour } from './components/GuidedTour.tsx';
import { CLOSED_CATEGORIES } from './data/categories.ts';
import {
  computeAdaptiveDisplayNumbers,
  mergeModularSlot,
  splitModularSlot,
  swapModularSlots,
  getSlotListPrice,
  getSlotDiscountedPrice,
  isReservationExpired,
} from './utils/modularGrid.ts';
import {
  Campaign,
  SlotState,
  SlotStatus,
  SlotFormat,
  LeadProspect,
  Household,
  CurationSummary,
} from './types.ts';
import {
  billableHouseholds,
  computeProgress,
  dropCostUsd,
  PhaseId,
  scaleCampaignToReach,
} from './workflow.ts';
import type { AppMode } from './hooks/useAppMode.ts';
import {
  generateSyntheticHouseholds,
  executePropensityCuration,
} from './services/propensityEngine.ts';
import {
  listCampaigns,
  createCampaign,
  updateCampaignSlot,
  updateCampaignStatus,
  resizeCampaign,
  resetSlotLayout,
  setCampaignArchived,
  deleteCampaign,
  batchUpdateCampaignSlots,
  executeBackendCuration,
} from './services/campaignService.ts';
import { useTheme } from './hooks/useTheme.ts';
import { useExpertMode } from './hooks/useExpertMode.ts';
import { useAppMode } from './hooks/useAppMode.ts';
import { ModeSwitch } from './components/ModeSwitch.tsx';
import { updateCosts } from './services/costService.ts';
import { Assistant } from './components/Assistant.tsx';
import { Settings } from './components/Settings.tsx';
import {
  AutofillResult,
  autofillSlots,
  markAllPaid,
  nextCandidate,
} from './services/slotFillService.ts';

const LAST_OPENED_KEY = 'coop.lastOpenedCampaign';

function mergeSlotUpdate(existing: SlotState, updated: SlotState): SlotState {
  const format: SlotFormat =
    updated.format && updated.format !== 'SMALL'
      ? updated.format
      : existing.format && existing.format !== 'SMALL'
      ? existing.format
      : existing.priceUsd === 1200 || updated.priceUsd === 1200 || existing.priceUsd === 1000 || updated.priceUsd === 1000
      ? 'LARGE'
      : existing.priceUsd === 650 || updated.priceUsd === 650 || existing.priceUsd === 550 || updated.priceUsd === 550
      ? 'MEDIUM'
      : updated.format || existing.format || 'SMALL';

  return {
    ...existing,
    ...updated,
    format,
    rowSpan: updated.rowSpan || existing.rowSpan || (format === 'LARGE' || format === 'MEDIUM' ? 2 : 1),
    colSpan: updated.colSpan || existing.colSpan || (format === 'LARGE' ? 2 : 1),
    gridRow: updated.gridRow || existing.gridRow,
    gridCol: updated.gridCol || existing.gridCol,
    side: updated.side || existing.side,
    notes: updated.notes !== undefined ? updated.notes : existing.notes,
  };
}

export default function App() {
  const { t, i18n } = useTranslation(['common']);
  const { theme, toggleTheme } = useTheme();
  const { expertMode } = useExpertMode();
  const { mode, setAppMode, mockMode } = useAppMode();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [openCampaignId, setOpenCampaignId] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<PhaseId>('slots');

  const [isLoadingFile, setIsLoadingFile] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSpec, setShowSpec] = useState(false);
  // Counts for the other world, so the switch says what it will reveal.
  const [otherModeCount, setOtherModeCount] = useState(0);

  // The walkthrough runs once per surface and can be replayed from the drawer.
  // It waits for the file to load: pointing at a row that is not painted yet
  // would highlight empty space.
  const [tour, setTour] = useState<'file' | 'form' | null>(null);

  // Slot the operator is recording a payment for.
  const [pendingPaymentSlot, setPendingPaymentSlot] = useState<number | null>(null);
  /** The box open in the inspector beside the card, if any. */
  const [inspectedSlot, setInspectedSlot] = useState<number | null>(null);
  /**
   * Drawn or not. Kept apart from the box itself so the curtain has something
   * to move: the panel mounts closed, opens on the next frame, and on the way
   * out it closes first and unmounts when the movement is over.
   */
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const closingInspector = useRef<number | undefined>(undefined);

  const openInspector = useCallback((slotNumber: number) => {
    window.clearTimeout(closingInspector.current);
    setInspectedSlot(slotNumber);
    // A timer, not requestAnimationFrame: rAF does not fire in a tab that is
    // not painting, and a panel that never opens because the window was in the
    // background is worse than one that opens without its curtain.
    window.setTimeout(() => setInspectorOpen(true), 20);
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    closingInspector.current = window.setTimeout(() => setInspectedSlot(null), 420);
  }, []);
  /**
   * When the last write landed in SQLite. Every mutation in this file runs
   * through `isSaving`, so watching it settle stamps them all without each
   * handler having to remember to.
   */
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const wasSaving = useRef(false);
  useEffect(() => {
    if (wasSaving.current && !isSaving) setLastSavedAt(new Date());
    wasSaving.current = isSaving;
  }, [isSaving]);
  // Reach being typed right now. Section 1 shows its consequences before the
  // write lands, which is why there is no Apply button.
  const [draftReach, setDraftReach] = useState<number | null>(null);
  // Archiving or deleting from the drawer's index.
  const [isFiling, setIsFiling] = useState(false);
  // The operating assistant, reachable from every surface.
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped when the cost model changes outside the panel, so section 1 refetches.
  const [costsVersion, setCostsVersion] = useState(0);
  // Filling the card with candidates, and swapping one that said no.
  const [isFilling, setIsFilling] = useState(false);
  const [fillReport, setFillReport] = useState<AutofillResult | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  /**
   * The campaign this operator last opened, which is what the drawer means by
   * "in hand". It lives in the browser rather than in the database on purpose:
   * two people share this file, and what the partner opened is their business,
   * not a reason to move what is in front of you.
   */
  const [lastOpenedId, setLastOpenedId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(LAST_OPENED_KEY);
    } catch {
      return null; // private windows and locked-down browsers
    }
  });

  const [curatedHouseholds, setCuratedHouseholds] = useState<Household[]>([]);
  const [curationSummary, setCurationSummary] = useState<CurationSummary | null>(null);
  const [isCurating, setIsCurating] = useState(false);

  const campaign = useMemo(
    () => campaigns.find((c) => String(c.id) === String(openCampaignId)) ?? null,
    [campaigns, openCampaignId],
  );

  const curatedCount = campaign
    ? Math.max(campaign.curatedCount ?? 0, curatedHouseholds.length)
    : 0;

  const progress = useMemo(
    () => (campaign ? computeProgress(campaign, curatedCount) : null),
    [campaign, curatedCount],
  );

  const loadFile = useCallback(async () => {
    setIsLoadingFile(true);
    try {
      const [list, other] = await Promise.all([
        listCampaigns(mode),
        listCampaigns(mode === 'LIVE' ? 'DEMO' : 'LIVE'),
      ]);
      setCampaigns(list);
      setOtherModeCount(other.length);
      setLoadError(null);
    } catch (err) {
      console.error('Failed to load the campaign file:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingFile(false);
    }
  }, [mode]);

  useEffect(() => {
    loadFile();
  }, [loadFile]);

  useEffect(() => {
    if (isLoadingFile || campaigns.length === 0) return;
    if (openCampaignId === null && !hasSeenTour('file')) setTour('file');
  }, [isLoadingFile, campaigns.length, openCampaignId]);

  useEffect(() => {
    if (openCampaignId !== null && !hasSeenTour('form')) {
      const id = window.setTimeout(() => setTour('form'), 600);
      return () => window.clearTimeout(id);
    }
  }, [openCampaignId]);

  /** Replace one campaign in the file without refetching the rest. */
  const patchCampaign = useCallback((id: string, update: (prev: Campaign) => Campaign) => {
    setCampaigns((prev) => prev.map((c) => (String(c.id) === String(id) ? update(c) : c)));
  }, []);

  const patchSlots = useCallback(
    (id: string, update: (slots: SlotState[]) => SlotState[]) => {
      patchCampaign(id, (c) => {
        const rawNextSlots = update(c.slots);
        const nextSlots = computeAdaptiveDisplayNumbers(rawNextSlots);
        const revenue = nextSlots.reduce((acc, s) => {
          if (s.format === 'USPS' || s.slotNumber === 32 || s.notes?.includes('Covered by')) return acc;
          return acc + (s.priceUsd || 0);
        }, 0);
        const cost = dropCostUsd(c);
        const margin = revenue > 0 ? (revenue - cost) / revenue : 0;
        const paidCount = nextSlots.filter((s) => s.status === 'PAID' && s.slotNumber !== 32).length;
        const totalCollected = nextSlots.reduce((acc, s) => {
          if (s.format === 'USPS' || s.slotNumber === 32 || s.notes?.includes('Covered by')) return acc;
          return s.status === 'PAID' ? acc + (s.amountCollectedUsd || s.priceUsd || 0) : acc;
        }, 0);
        const advCount = nextSlots.filter((s) => s.slotNumber !== 32 && !s.notes?.includes('Covered by')).length;
        const nextStatus =
          advCount > 0 && paidCount >= advCount
            ? 'LOCKED_READY'
            : c.status === 'LOCKED_READY'
            ? 'PROSPECTING'
            : c.status;
        return {
          ...c,
          slots: nextSlots,
          targetGrossRevenue: revenue,
          operatingCostEst: cost,
          netMarginEst: Math.max(0, revenue - cost),
          targetMargin: margin,
          paidCount,
          totalCollectedUsd: totalCollected,
          status: nextStatus,
        };
      });
    },
    [patchCampaign],
  );

  const handleOpenCampaign = useCallback(
    (id: string) => {
      const next = campaigns.find((c) => String(c.id) === String(id));
      setOpenCampaignId(String(id));
      setLastOpenedId(String(id));
      try {
        window.localStorage.setItem(LAST_OPENED_KEY, String(id));
      } catch {
        // Not being able to remember is not a reason to fail to open.
      }
      setCuratedHouseholds([]);
      setCurationSummary(null);
      setPendingPaymentSlot(null);
      // Land the operator on the section that owes work, not on section 1.
      if (next) {
        setActivePhase(computeProgress(next, next.curatedCount ?? 0).current);
      }
      if (window.location.hash !== `#/c/${id}`) {
        window.location.hash = `#/c/${id}`;
      }
    },
    [campaigns],
  );

  const handleBackToFile = () => {
    setOpenCampaignId(null);
    setPendingPaymentSlot(null);
    if (window.location.hash) window.location.hash = '';
    loadFile();
  };

  // One campaign, one address. Two people share this file, so a form has to be
  // sendable as a link rather than described as "the Fontana one".
  //
  // The listener is attached once and reads the current logic through a ref;
  // re-subscribing on every file update would tear the listener down and back
  // up on each slot edit. Only a *change* of target opens a campaign, because
  // reopening the one already on screen would reset the curation results held
  // for this session.
  const applyHashRef = useRef(() => {});
  applyHashRef.current = () => {
    const match = window.location.hash.match(/^#\/c\/(.+)$/);
    const id = match ? decodeURIComponent(match[1]) : null;
    if (id !== null && String(id) === String(openCampaignId)) return;
    if (id === null) {
      setOpenCampaignId(null);
      return;
    }
    const matched = campaigns.find((c) => String(c.id) === String(id));
    if (matched) handleOpenCampaign(String(matched.id));
  };

  useEffect(() => {
    const onHashChange = () => applyHashRef.current();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // A link opened cold lands before the file has loaded, so resolve the hash
  // again once campaigns arrive.
  useEffect(() => {
    applyHashRef.current();
  }, [campaigns.length]);

  const handleSwitchMode = (next: AppMode) => {
    if (next === mode) return;
    setOpenCampaignId(null);
    setCuratedHouseholds([]);
    setCurationSummary(null);
    setPendingPaymentSlot(null);
    if (window.location.hash) window.location.hash = '';
    setAppMode(next);
  };

  const handleCreateCampaign = async (city: string, zip: string, households: number) => {
    setIsCreating(true);
    try {
      const created = await createCampaign(city, zip, mode, households);
      setCampaigns((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
      handleOpenCampaign(created.id);
    } catch (err) {
      console.error('Failed to create campaign:', err);
      const raw = err instanceof Error ? err.message : String(err);
      // A conflict is an ordinary outcome — this zone already has a drop this
      // month — so it reads as a sentence, not as an HTTP status.
      setLoadError(
        raw.startsWith('CONFLICT:')
          ? t('common:file.createConflict', { zone: `${city} · ${zip}` })
          : raw,
      );
    } finally {
      setIsCreating(false);
    }
  };

  /**
   * File a campaign away, or bring it back. Archiving destroys nothing: the
   * campaign keeps its slots, its money and its audience and simply stops
   * competing for attention in the drawer.
   */
  const handleArchiveCampaign = async (campaignId: string, archived: boolean) => {
    setIsFiling(true);
    try {
      const updated = await setCampaignArchived(campaignId, archived);
      patchCampaign(campaignId, () => updated);
      setLoadError(null);
    } catch (err) {
      console.error('Failed to archive campaign:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFiling(false);
    }
  };

  /**
   * Destroy a campaign. The backend refuses this for a live campaign that holds
   * work — money collected, an audience cut, a drop at the printer — because
   * that is a business record; the refusal comes back as a sentence, not a code.
   */
  const handleDeleteCampaign = async (campaignId: string) => {
    setIsFiling(true);
    try {
      await deleteCampaign(campaignId);
      setCampaigns((prev) => prev.filter((c) => String(c.id) !== String(campaignId)));
      if (String(openCampaignId) === String(campaignId)) setOpenCampaignId(null);
      setLoadError(null);
    } catch (err) {
      console.error('Failed to delete campaign:', err);
      const raw = err instanceof Error ? err.message : String(err);
      setLoadError(raw.startsWith('CONFLICT:') ? t('common:file.deleteFailed') : raw);
    } finally {
      setIsFiling(false);
    }
  };

  /**
   * Change the drop's reach. Every slot price, the print cost, the curation cut
   * and the manifest all hang off this number, so the backend re-prices the
   * slots and discards an audience that was cut to the old reach.
   */
  const handleResizeCampaign = async (households: number) => {
    if (!campaign) return;
    setIsSaving(true);
    try {
      const updated = await resizeCampaign(campaign.id, households);
      patchCampaign(campaign.id, () => updated);
      setDraftReach(null);
      setCuratedHouseholds([]);
      setCurationSummary(null);
      setLoadError(null);
    } catch (err) {
      console.error('Failed to resize campaign:', err);
      const raw = err instanceof Error ? err.message : String(err);
      setLoadError(raw.startsWith('CONFLICT:') ? t('common:reach.conflict') : raw);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Write the cost model's suggested prices onto every slot that has not been
   * paid yet. Paid slots are left alone: that price is already a transaction.
   */
  const handleApplySuggestedPrices = async (prices: Record<number, number>) => {
    if (!campaign) return;
    const updates = campaign.slots
      .filter((s) => s.status !== 'PAID' && prices[s.slotNumber] !== undefined && prices[s.slotNumber] > 0)
      .map((s) => ({ slotNumber: s.slotNumber, priceUsd: prices[s.slotNumber] }));
    if (updates.length === 0) return;

    // Actualización optimista inmediata en memoria para UI ultra fluida
    patchSlots(campaign.id, (slots) =>
      slots.map((s) =>
        s.status !== 'PAID' && prices[s.slotNumber] !== undefined && prices[s.slotNumber] > 0
          ? { ...s, priceUsd: prices[s.slotNumber] }
          : s,
      ),
    );

    setIsSaving(true);
    try {
      const updated = await batchUpdateCampaignSlots(campaign.id, updates);
      const updatedMap = new Map(updated.map((s) => [s.slotNumber, s]));
      patchSlots(campaign.id, (prevSlots) =>
        prevSlots.map((s) => {
          const fresh = updatedMap.get(s.slotNumber);
          return fresh ? { ...s, ...fresh } : s;
        }),
      );
      setLoadError(null);
    } catch (err) {
      console.error('Failed to apply suggested prices:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * A cost edit changes what every drop costs, so the open campaign's figures
   * follow it at once: the ledger, the margin and the section 3 gate all read
   * from these two numbers. A drop already at the printer keeps its stamped
   * cost, which is what the backend reports for it.
   */
  const handleCostsChange = useCallback((unitCost: number, fixedCost: number) => {
    setCampaigns((prev) => {
      // Same numbers: keep the identical array so nothing re-renders.
      const stale = prev.some(
        (c) =>
          c.status !== 'IN_PRODUCTION' &&
          c.status !== 'MAILED' &&
          (c.unitCostUsd !== unitCost || (c.fixedCostUsd ?? 0) !== fixedCost),
      );
      if (!stale) return prev;
      return prev.map((c) =>
        c.status === 'IN_PRODUCTION' || c.status === 'MAILED'
          ? c
          : { ...c, unitCostUsd: unitCost, fixedCostUsd: fixedCost },
      );
    });
  }, []);

  // ---------------------------------------------------------------- slots

  const handleUpdateSlotStatus = async (slotNumber: number, newStatus: SlotStatus) => {
    if (!campaign) return;

    // Money moves outside the app, so PAID is a record of a transfer that
    // already happened: collect the reference before committing it.
    if (newStatus === 'PAID') {
      const currentSlot = campaign.slots.find((s) => s.slotNumber === slotNumber);
      const hasClient = Boolean(currentSlot?.businessName && currentSlot.businessName.trim().length > 0);
      if (mode === 'LIVE' && !hasClient) {
        return;
      }
      setPendingPaymentSlot(slotNumber);
      return;
    }

    const currentSlot = campaign.slots.find((s) => s.slotNumber === slotNumber);
    const wasPaid = currentSlot?.status === 'PAID';

    if (wasPaid) {
      await handleUndoPayment(slotNumber, newStatus, newStatus === 'VACANT');
      return;
    }

    const isReserving = newStatus === 'RESERVED';
    const isVacating = newStatus === 'VACANT';
    const reservedAt = isReserving ? new Date().toISOString() : undefined;
    const reservationExpiresAt = isReserving
      ? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
      : undefined;

    // Apply 72h reservation discount when RESERVED, or restore list price when moving to VACANT/PROSPECTING
    const targetPrice = isReserving
      ? (currentSlot ? getSlotDiscountedPrice(currentSlot) : 300)
      : (currentSlot ? getSlotListPrice(currentSlot) : 350);

    const vacantFields = isVacating
      ? {
          businessName: '',
          phone: '',
          contactPerson: '',
          email: '',
          website: '',
          businessAddress: '',
          offerHeadline: '',
        }
      : {};

    setIsSaving(true);
    patchSlots(campaign.id, (slots) =>
      slots.map((s) =>
        s.slotNumber === slotNumber
          ? {
              ...s,
              status: newStatus,
              priceUsd: targetPrice,
              reservedAt,
              reservationExpiresAt,
              ...vacantFields,
            }
          : s
      ),
    );
    try {
      const updated = await updateCampaignSlot(campaign.id, slotNumber, {
        status: newStatus,
        priceUsd: targetPrice,
        ...(isReserving
          ? { reservedAt, reservationExpiresAt }
          : { reservedAt: null as any, reservationExpiresAt: null as any }),
        ...vacantFields,
      });
      patchSlots(campaign.id, (slots) =>
        slots.map((s) => (s.slotNumber === slotNumber ? mergeSlotUpdate(s, updated) : s)),
      );
    } catch (err) {
      console.error('Failed to persist slot status to SQLite:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMergeSlot = async (slotNumber: number, targetFormat: 'MEDIUM' | 'LARGE') => {
    if (!campaign) return;
    setIsSaving(true);
    const updatedSlots = mergeModularSlot(slotNumber, targetFormat, campaign.slots);
    patchSlots(campaign.id, () => updatedSlots);
    const primary = campaign.slots.find((s) => s.slotNumber === slotNumber);
    if (primary && (primary.gridRow === 2 || primary.gridRow === 4) && targetFormat === 'MEDIUM') {
      const movedMed = updatedSlots.find(
        (s) =>
          s.format === 'MEDIUM' &&
          !s.notes?.startsWith('Covered by') &&
          s.slotNumber !== slotNumber &&
          ((primary.businessName && s.businessName === primary.businessName) || s.categoryId === primary.categoryId)
      );
      if (movedMed && inspectedSlot === slotNumber) {
        setInspectedSlot(movedMed.slotNumber);
      }
    }
    try {
      await batchUpdateCampaignSlots(campaign.id, updatedSlots);
    } catch (err) {
      console.error('Failed to persist merged modular slots:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSplitSlot = async (slotNumber: number, targetFormat: 'SMALL' | 'MEDIUM' = 'SMALL') => {
    if (!campaign) return;
    setIsSaving(true);
    const updatedSlots = splitModularSlot(slotNumber, campaign.slots, targetFormat);
    patchSlots(campaign.id, () => updatedSlots);
    try {
      await batchUpdateCampaignSlots(campaign.id, updatedSlots);
    } catch (err) {
      console.error('Failed to persist split modular slots:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReleaseReservation = async (slotNumber: number) => {
    if (!campaign) return;
    setIsSaving(true);
    const currentSlot = campaign.slots.find((s) => s.slotNumber === slotNumber);
    const listPrice = currentSlot ? getSlotListPrice(currentSlot) : 350;

    patchSlots(campaign.id, (slots) =>
      slots.map((s) =>
        s.slotNumber === slotNumber
          ? {
              ...s,
              status: 'VACANT',
              priceUsd: listPrice,
              businessName: '',
              phone: '',
              contactPerson: '',
              email: '',
              website: '',
              businessAddress: '',
              offerHeadline: '',
              reservedAt: undefined,
              reservationExpiresAt: undefined,
            }
          : s
      ),
    );
    try {
      const updated = await updateCampaignSlot(campaign.id, slotNumber, {
        status: 'VACANT',
        priceUsd: listPrice,
        businessName: '',
        phone: '',
        contactPerson: '',
        email: '',
        website: '',
        businessAddress: '',
        offerHeadline: '',
        reservedAt: null as any,
        reservationExpiresAt: null as any,
      });
      patchSlots(campaign.id, (slots) =>
        slots.map((s) => (s.slotNumber === slotNumber ? mergeSlotUpdate(s, updated) : s)),
      );
    } catch (err) {
      console.error('Failed to release reservation:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReactivateOffer = async (slotNumber: number) => {
    if (!campaign) return;
    setIsSaving(true);
    const currentSlot = campaign.slots.find((s) => s.slotNumber === slotNumber);
    if (!currentSlot) {
      setIsSaving(false);
      return;
    }

    const discountedPrice = getSlotDiscountedPrice(currentSlot);
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    patchSlots(campaign.id, (slots) =>
      slots.map((s) =>
        s.slotNumber === slotNumber
          ? {
              ...s,
              status: 'RESERVED',
              priceUsd: discountedPrice,
              reservedAt: nowIso,
              reservationExpiresAt: expiresAt,
            }
          : s
      )
    );

    try {
      const updated = await updateCampaignSlot(campaign.id, slotNumber, {
        status: 'RESERVED',
        priceUsd: discountedPrice,
        reservedAt: nowIso,
        reservationExpiresAt: expiresAt,
      });
      patchSlots(campaign.id, (slots) =>
        slots.map((s) => (s.slotNumber === slotNumber ? mergeSlotUpdate(s, updated) : s))
      );
    } catch (err) {
      console.error('Failed to reactivate offer:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmPayment = async (record: {
    paymentRef: string;
    amountCollectedUsd: number;
    paidAt: string;
  }) => {
    if (!campaign || pendingPaymentSlot === null) return;
    const slotNumber = pendingPaymentSlot;
    setIsSaving(true);
    try {
      const updated = await updateCampaignSlot(campaign.id, slotNumber, {
        status: 'PAID',
        ...record,
      });
      patchSlots(campaign.id, (slots) =>
        slots.map((s) => (s.slotNumber === slotNumber ? mergeSlotUpdate(s, updated) : s)),
      );
      setPendingPaymentSlot(null);
    } catch (err) {
      console.error('Failed to persist payment record to SQLite:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateSlotPrice = async (slotNumber: number, priceUsd: number) => {
    if (!campaign) return;
    setIsSaving(true);
    patchSlots(campaign.id, (slots) =>
      slots.map((s) => (s.slotNumber === slotNumber ? { ...s, priceUsd } : s)),
    );
    try {
      await updateCampaignSlot(campaign.id, slotNumber, { priceUsd });
    } catch (err) {
      console.error('Failed to persist slot price to SQLite:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateSlotAvgTicket = async (slotNumber: number, avgTicketUsd: number) => {
    if (!campaign) return;
    setIsSaving(true);
    patchSlots(campaign.id, (slots) =>
      slots.map((s) => (s.slotNumber === slotNumber ? { ...s, avgTicketUsd } : s)),
    );
    try {
      await updateCampaignSlot(campaign.id, slotNumber, { avgTicketUsd });
    } catch (err) {
      console.error('Failed to persist slot avg ticket to SQLite:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateSlotBusiness = async (
    slotNumber: number,
    businessName: string,
    headline?: string,
  ) => {
    if (!campaign) return;
    setIsSaving(true);
    const existing = campaign.slots.find((s) => s.slotNumber === slotNumber);
    const targetStatus: SlotStatus =
      existing?.status === 'VACANT' ? 'RESERVED' : existing?.status || 'RESERVED';
    const effectiveHeadline = headline !== undefined ? headline : (existing?.offerHeadline ?? '');

    // 1. Optimistic update immediately so the canvas reacts in real time without lag
    patchSlots(campaign.id, (slots) =>
      slots.map((s) =>
        s.slotNumber === slotNumber
          ? {
              ...s,
              businessName,
              offerHeadline: effectiveHeadline,
              status: targetStatus,
            }
          : s,
      ),
    );

    try {
      const updated = await updateCampaignSlot(campaign.id, slotNumber, {
        businessName,
        offerHeadline: effectiveHeadline,
        status: targetStatus,
      });
      patchSlots(campaign.id, (slots) =>
        slots.map((s) => (s.slotNumber === slotNumber ? mergeSlotUpdate(s, updated) : s)),
      );
    } catch (err) {
      console.error('Failed to persist slot business to SQLite:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearSlot = async (slotNumber: number) => {
    if (!campaign) return;
    setIsSaving(true);
    const currentSlot = campaign.slots.find((s) => s.slotNumber === slotNumber);
    const listPrice = currentSlot ? getSlotListPrice(currentSlot) : 350;
    const reset = {
      businessName: '',
      contactPerson: '',
      phone: '',
      email: '',
      website: '',
      businessAddress: '',
      offerHeadline: '',
      status: 'VACANT' as SlotStatus,
      priceUsd: listPrice,
      paymentRef: '',
      amountCollectedUsd: 0,
      paidAt: null,
      reservedAt: null as any,
      reservationExpiresAt: null as any,
    };
    patchSlots(campaign.id, (slots) =>
      slots.map((s) =>
        s.slotNumber === slotNumber
          ? { ...s, ...reset, paidAt: undefined, amountCollectedUsd: 0, reservedAt: undefined, reservationExpiresAt: undefined }
          : s,
      ),
    );
    try {
      await updateCampaignSlot(campaign.id, slotNumber, reset);
    } catch (err) {
      console.error('Failed to persist slot release to SQLite:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSwapSlots = async (sourceSlotNumber: number, targetSlotNumber: number) => {
    if (!campaign || sourceSlotNumber === targetSlotNumber) return;
    setIsSaving(true);
    const updatedSlots = swapModularSlots(sourceSlotNumber, targetSlotNumber, campaign.slots);
    patchSlots(campaign.id, () => updatedSlots);

    try {
      await batchUpdateCampaignSlots(campaign.id, updatedSlots);
    } catch (err) {
      console.error('Failed to persist swapped slots to SQLite:', err);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Put every niche back in the box it was designed for. The advertisers travel
   * with their niche, so nobody loses their name, their headline or their
   * payment: only the arrangement returns to the factory layout.
   */
  const handleResetSlotLayout = async (wipe = false) => {
    if (!campaign) return;
    setIsSaving(true);
    try {
      const updated = await resetSlotLayout(campaign.id, wipe);
      patchCampaign(campaign.id, () => updated);
      setLoadError(null);
    } catch (err) {
      console.error('Failed to reset the slot layout:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * The route engine reports how many households the selected routes cover.
   * That number is the drop: the postal zone on the card prints it, the ledger
   * bills postage and printing on it, and the margin is measured against it.
   */
  const handleCoverageChange = useCallback(
    (covered: number, routeCount: number) => {
      if (!openCampaignId) return;
      patchCampaign(openCampaignId, (c) =>
        c.coveredHouseholds === covered && c.selectedRoutes === routeCount
          ? c
          : { ...c, coveredHouseholds: covered, selectedRoutes: routeCount },
      );
    },
    [openCampaignId, patchCampaign],
  );

  /**
   * Put a candidate in every empty box in one pass, so the partner's next act
   * is a phone call rather than fourteen searches. Nothing here sells anything:
   * the boxes land as PROSPECTING, which is a call to make.
   */
  const handleAutofillSlots = async () => {
    if (!campaign) return;
    setIsFilling(true);
    setFillReport(null);
    try {
      // Real sources in both worlds. Practising against invented businesses
      // teaches nothing about the actual microzone, and the free sources —
      // OpenStreetMap, and Yelp where it has to step in — cost nothing to ask.
      // A niche with no real business leaves its box empty and says so.
      const report = await autofillSlots(campaign.id, false);
      setFillReport(report);
      const refreshed = await listCampaigns(mode);
      setCampaigns(refreshed);
      setLoadError(null);
    } catch (err) {
      console.error('Autofill failed:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFilling(false);
    }
  };

  /** They said no: remember it and bring the next candidate for that box. */
  const handleNextCandidate = async (slotNumber: number) => {
    if (!campaign) return;
    setBusySlot(slotNumber);
    try {
      const result = await nextCandidate(campaign.id, slotNumber, false, true);
      const refreshed = await listCampaigns(mode);
      setCampaigns(refreshed);
      setLoadError(result.exhausted ? (result.detail ?? null) : null);
    } catch (err) {
      console.error('Next candidate failed:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusySlot(null);
    }
  };

  /**
   * Practice shortcut: stamp the whole card as collected so section 3 opens.
   * The backend refuses this outside the practice file.
   */
  const handleMarkAllPaid = async () => {
    if (!campaign) return;
    setIsSaving(true);
    try {
      await markAllPaid(campaign.id);
      setCampaigns(await listCampaigns(mode));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Undo a payment or rollback / unregister a slot.
   * - targetStatus: status to revert to ('RESERVED', 'PROSPECTING', or 'VACANT').
   * - clearBusiness: whether to wipe business information (for client rollback/unregister).
   */
  const handleUndoPayment = async (
    slotNumber: number,
    targetStatus: SlotStatus = 'RESERVED',
    clearBusiness: boolean = false,
  ) => {
    if (!campaign) return;
    setIsSaving(true);
    const shouldWipeBusiness = clearBusiness || targetStatus === 'VACANT';
    const currentSlot = campaign.slots.find((s) => s.slotNumber === slotNumber);
    const targetPrice = targetStatus === 'RESERVED'
      ? (currentSlot ? getSlotDiscountedPrice(currentSlot) : 300)
      : (currentSlot ? getSlotListPrice(currentSlot) : 350);

    try {
      const resetPayload: any = {
        status: targetStatus,
        priceUsd: targetPrice,
        paymentRef: '',
        amountCollectedUsd: 0,
        paidAt: null,
      };
      if (shouldWipeBusiness) {
        resetPayload.businessName = '';
        resetPayload.contactPerson = '';
        resetPayload.phone = '';
        resetPayload.email = '';
        resetPayload.website = '';
        resetPayload.businessAddress = '';
        resetPayload.offerHeadline = '';
        resetPayload.reservedAt = null;
        resetPayload.reservationExpiresAt = null;
      }
      const updated = await updateCampaignSlot(campaign.id, slotNumber, resetPayload);
      patchSlots(campaign.id, (slots) =>
        slots.map((s) =>
          s.slotNumber === slotNumber
            ? {
                ...mergeSlotUpdate(s, updated),
                status: targetStatus,
                priceUsd: targetPrice,
                paymentRef: '',
                amountCollectedUsd: 0,
                paidAt: undefined,
                ...(shouldWipeBusiness
                  ? {
                      businessName: '',
                      contactPerson: '',
                      phone: '',
                      email: '',
                      website: '',
                      businessAddress: '',
                      offerHeadline: '',
                    }
                  : {}),
              }
            : s,
        ),
      );
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssignLeadToSlot = async (
    slotNumber: number,
    lead: LeadProspect,
    targetStatus: SlotStatus = 'RESERVED',
  ) => {
    if (!campaign) return;
    const isReserving = targetStatus === 'RESERVED';
    const reservedAt = isReserving ? new Date().toISOString() : undefined;
    const reservationExpiresAt = isReserving
      ? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
      : undefined;

    const currentSlot = campaign.slots.find((s) => s.slotNumber === slotNumber);
    const targetPrice = isReserving
      ? (currentSlot ? getSlotDiscountedPrice(currentSlot) : 300)
      : (currentSlot ? getSlotListPrice(currentSlot) : 350);

    setIsSaving(true);
    try {
      const updated = await updateCampaignSlot(campaign.id, slotNumber, {
        businessName: lead.businessName,
        contactPerson: lead.decisionMaker,
        phone: lead.phone,
        email: lead.email,
        website: lead.websiteUrl,
        businessAddress: lead.address ? `${lead.address}, ${lead.city || ''}`.trim() : undefined,
        status: targetStatus,
        priceUsd: targetPrice,
        offerHeadline: lead.bilingualHooks?.es || '',
        ...(isReserving ? { reservedAt, reservationExpiresAt } : {}),
      });
      patchSlots(campaign.id, (slots) =>
        slots.map((s) => (s.slotNumber === slotNumber ? mergeSlotUpdate(s, updated) : s)),
      );
      setActivePhase('slots');
    } catch (err) {
      console.error('Failed to persist lead assignment to SQLite:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSourceLeadForSlot = (slotNumber: number) => {
    setActivePhase('slots');
    openInspector(slotNumber);
  };

  const handleIncrementScan = async (slotNumber: number) => {
    if (!campaign) return;
    const current = campaign.slots.find((s) => s.slotNumber === slotNumber);
    if (!current) return;
    const scanCount = current.scanCount + 1;
    patchSlots(campaign.id, (slots) =>
      slots.map((s) => (s.slotNumber === slotNumber ? { ...s, scanCount } : s)),
    );
    try {
      await updateCampaignSlot(campaign.id, slotNumber, { scanCount });
    } catch (err) {
      console.error('Failed to persist scan count to SQLite:', err);
    }
  };

  // ------------------------------------------------------------- curation

  const handleRunCuration = async () => {
    if (!campaign) return;
    setIsCurating(true);
    try {
      const weights = CLOSED_CATEGORIES.map((c) => [
        c.demographicWeights.income,
        c.demographicWeights.homeOwnership,
        c.demographicWeights.homeAgeYears,
        c.demographicWeights.childrenPresent,
        c.demographicWeights.vehiclesCount,
        c.demographicWeights.petOwner,
        c.demographicWeights.homeValue,
      ]);

      const target = campaign.totalTargetHouseholds;
      const data = await executeBackendCuration(campaign.id, weights, target, mockMode);
      const summary: CurationSummary = data.summary || {
        totalAnalyzed: (data as any).total_analyzed || target * 3,
        totalSelected: (data as any).total_selected || target,
        minScore: (data as any).min_score || 60,
        maxScore: (data as any).max_score || 90,
        avgScore: (data as any).avg_score || 75,
        carrierRouteDistribution: ((data as any).carrier_route_breakdown || []).map((r: any) => ({
          route: r.carrier_route || r.route,
          count: r.count,
          zip: campaign.targetZip,
        })),
        categorySynergyBreakdown: [],
        scoreHistogram: (data as any).histogram || [],
      };

      const households = data.top_5k || [];
      setCuratedHouseholds(households);
      setCurationSummary(summary);
      patchCampaign(campaign.id, (c) => ({
        ...c,
        status: 'CURATED',
        curatedCount: households.length || summary.totalSelected,
      }));
    } catch (err) {
      console.error('Backend curation failed, executing fallback local curation:', err);
      const target = campaign.totalTargetHouseholds;
      const pool = generateSyntheticHouseholds(
        campaign.targetCity,
        campaign.targetZip,
        Math.max(15000, target * 3),
      );
      const { curatedHouseholds: top5k, summary } = executePropensityCuration(
        pool,
        CLOSED_CATEGORIES,
        target,
      );
      setCuratedHouseholds(top5k);
      setCurationSummary(summary);
      patchCampaign(campaign.id, (c) => ({
        ...c,
        status: 'CURATED',
        curatedCount: top5k.length,
      }));
    } finally {
      setIsCurating(false);
    }
  };

  // ----------------------------------------------------------- production

  const advanceStatus = async (status: Campaign['status']) => {
    if (!campaign) return;
    setIsSaving(true);
    try {
      const updated = await updateCampaignStatus(campaign.id, status);
      patchCampaign(campaign.id, (c) => ({
        ...c,
        status: updated.status,
        productionAt: updated.productionAt,
        mailedAt: updated.mailedAt,
      }));
      if (status === 'IN_PRODUCTION') setActivePhase('production');
    } catch (err) {
      console.error('Failed to advance campaign status:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------- view

  const isSpanish = (i18n.language || 'es').toLowerCase().startsWith('es');
  // One ruled cell split in two, so the controls sit on the form's ruling
  // instead of floating beside it. Both chips name what the next press gives
  // you, never the current state: the partner works in two languages daily and
  // two identical chips pointing opposite ways is a trap.
  const chrome = (
    <div className="flex items-stretch divide-x divide-rule border border-rule">
      <button
        id="btn-open-settings"
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label={t('common:settings.open')}
        className="field-label flex min-h-11 min-w-11 sm:min-w-0 items-center justify-center gap-1.5 px-2.5 transition-colors hover:bg-secondary hover:text-ink"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">{t('common:settings.open')}</span>
      </button>
      <button
        id="btn-open-assistant"
        data-tour="assistant"
        type="button"
        onClick={() => setAssistantOpen(true)}
        aria-label={t('common:assistant.open')}
        className="field-label flex min-h-11 min-w-11 sm:min-w-0 items-center justify-center gap-1.5 px-2.5 text-live transition-colors hover:bg-secondary"
      >
        <MessageCircleQuestion className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">{t('common:assistant.open')}</span>
      </button>
      <button
        id="language-toggle-btn"
        type="button"
        onClick={() => i18n.changeLanguage(isSpanish ? 'en' : 'es')}
        aria-label={t('common:header.switchTo', { lang: isSpanish ? 'English' : 'Español' })}
        className="field-label flex min-h-11 min-w-11 items-center justify-center px-2.5 transition-colors hover:bg-secondary hover:text-ink"
      >
        {isSpanish ? 'EN' : 'ES'}
      </button>
      <button
        id="theme-toggle-btn"
        type="button"
        onClick={toggleTheme}
        aria-label={
          theme === 'dark'
            ? t('common:header.toggleThemeLight')
            : t('common:header.toggleThemeDark')
        }
        className="field-label flex min-h-11 min-w-11 sm:min-w-0 items-center justify-center gap-1.5 px-2.5 transition-colors hover:bg-secondary hover:text-ink"
      >
        {theme === 'dark' ? (
          <>
            <Sun className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{t('common:form.stockLight')}</span>
          </>
        ) : (
          <>
            <Moon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{t('common:form.stockDark')}</span>
          </>
        )}
      </button>
    </div>
  );

  const renderSection = (phase: PhaseId): React.ReactNode => {
    if (!campaign) return null;
    const pendingSlot =
      pendingPaymentSlot !== null
        ? campaign.slots.find((s) => s.slotNumber === pendingPaymentSlot)
        : undefined;

    switch (phase) {
      case 'slots': {
        // While the operator types a new reach, section 1 runs on the typed
        // number: the ledger, the print cost and the 14 prices all scale with
        // it. The backend write happens when typing settles.
        const shown =
          draftReach && draftReach !== campaign.totalTargetHouseholds
            ? scaleCampaignToReach(campaign, draftReach)
            : campaign;
        const inspected =
          inspectedSlot !== null
            ? shown.slots.find((s) => s.slotNumber === inspectedSlot)
            : undefined;
        return (
          <>
            <FinancialMetrics
              campaign={shown}
              baseCampaign={campaign}
              onResize={handleResizeCampaign}
              onDraftChange={setDraftReach}
              onApplySuggested={handleApplySuggestedPrices}
              onTargetMarginSave={async (val) => {
                try {
                  await updateCosts(mode, billableHouseholds(shown), { targetMargin: val / 100 });
                } catch (err) {
                  console.error('Failed to persist target margin:', err);
                }
              }}
              isSaving={isSaving}
            />
            {/* The postal card with its integrated curtain inspector. At rest the
                slots take the full width of the flyer; clicking any slot smoothly draws
                open the inspector curtain at the exact height of the slots. */}
            <PostalCanvas
              slots={shown.slots}
              onUpdateSlotStatus={handleUpdateSlotStatus}
              onUpdateSlotBusiness={handleUpdateSlotBusiness}
              onUpdateSlotPrice={handleUpdateSlotPrice}
              onUpdateSlotAvgTicket={handleUpdateSlotAvgTicket}
              onSwapSlots={handleSwapSlots}
              onMergeSlot={handleMergeSlot}
              onSplitSlot={handleSplitSlot}
              onReleaseReservation={handleReleaseReservation}
              onReactivateOffer={handleReactivateOffer}
              onResetLayout={mode === 'DEMO' ? handleResetSlotLayout : undefined}
              onAutofill={mode === 'DEMO' ? handleAutofillSlots : undefined}
              onMarkAllPaid={mode === 'DEMO' ? handleMarkAllPaid : undefined}
              onUndoPayment={handleUndoPayment}
              isDemo={mode === 'DEMO'}
              onNextCandidate={handleNextCandidate}
              isFilling={isFilling}
              busySlot={busySlot}
              fillReport={fillReport}
              coveredHouseholds={shown.coveredHouseholds ?? 0}
              selectedRoutes={shown.selectedRoutes ?? 0}
              onQuickSimulateAllPaid={undefined}
              onExecuteCuration={undefined}
              onSourceLeadForSlot={handleSourceLeadForSlot}
              onClearSlot={handleClearSlot}
              isSaving={isSaving}
              isLoading={false}
              onInspectSlot={openInspector}
              selectedSlot={inspectedSlot}
              inspectorOpen={inspectorOpen}
              onCloseInspector={closeInspector}
              inspectorNode={
                inspected ? (
                  <SlotInspector
                    slot={inspected}
                    slots={campaign.slots}
                    campaignId={campaign.id}
                    targetCity={campaign.targetCity}
                    targetZip={campaign.targetZip}
                    // Candidates are always the real ones, in both worlds. The
                    // practice file simulates the audience, never the businesses:
                    // an invented shop with no phone is a box nobody can sell.
                    mockMode={false}
                    isSaving={isSaving}
                    onClose={closeInspector}
                    onUpdateBusiness={handleUpdateSlotBusiness}
                    onUpdateStatus={handleUpdateSlotStatus}
                    onReactivateOffer={handleReactivateOffer}
                    onSwapSlots={(from, to) => {
                      handleSwapSlots(from, to);
                      setInspectedSlot(to);
                    }}
                    onClearSlot={(n) => {
                      handleClearSlot(n);
                    }}
                    onUndoPayment={handleUndoPayment}
                    onAssignLead={handleAssignLeadToSlot}
                  />
                ) : null
              }
            />
            {pendingSlot && (
              <PaymentStamp
                slot={pendingSlot}
                onConfirm={handleConfirmPayment}
                onCancel={() => setPendingPaymentSlot(null)}
                isSaving={isSaving}
              />
            )}
          </>
        );
      }

      case 'curation':
        return (
          <CurationStudio
            campaignCode={campaign.code}
            campaignId={campaign.id}
            targetCity={campaign.targetCity}
            targetZip={campaign.targetZip}
            targetHouseholds={campaign.totalTargetHouseholds}
            onCoverageChange={handleCoverageChange}
            curatedHouseholds={curatedHouseholds}
            curationSummary={curationSummary}
            isCurating={isCurating}
            onRunCuration={handleRunCuration}
            onGoToExport={() => setActivePhase('manifest')}
            mockMode={mockMode}
            persistedCount={campaign.curatedCount ?? 0}
          />
        );

      case 'manifest':
        return (
          <PostalExportView
            campaign={campaign}
            slots={campaign.slots}
            curatedHouseholds={curatedHouseholds}
            onIncrementScan={handleIncrementScan}
            section="manifest"
            onDeliveredToPrinter={() => advanceStatus('IN_PRODUCTION')}
            isSaving={isSaving}
            persistedCount={curatedCount}
          />
        );

      case 'production':
        return (
          <>
            <ProductionSection
              campaign={campaign}
              onMarkMailed={() => advanceStatus('MAILED')}
              isSaving={isSaving}
            />
            <div className="mt-8 border-t border-rule-strong pt-6">
              <PostalExportView
                campaign={campaign}
                slots={campaign.slots}
                curatedHouseholds={curatedHouseholds}
                onIncrementScan={handleIncrementScan}
                section="telemetry"
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <GuidedTour
        tourId={tour === 'form' ? 'form' : 'file'}
        steps={tour === 'form' ? FORM_TOUR : FILE_TOUR}
        active={tour !== null && !showSpec}
        onClose={() => setTour(null)}
      />

      {loadError && (
        <p className="border-b border-due bg-due/10 px-6 py-2 font-mono text-[0.69rem] text-due">
          {t('common:file.loadError', { error: loadError })}
        </p>
      )}

      {campaign && progress ? (
        <FormShell
          campaign={campaign}
          progress={progress}
          activePhase={activePhase}
          onSelectPhase={setActivePhase}
          onReplayTour={() => setTour('form')}
          onBackToFile={handleBackToFile}
          expertMode={expertMode}
          isSyncing={isSaving}
          lastSavedAt={lastSavedAt}
          renderSection={renderSection}
        >
          {chrome}
        </FormShell>
      ) : showSpec ? (
        <div className="mx-auto w-full max-w-6xl px-6 pb-20">
          <div className="flex items-center justify-between gap-4 border-b border-rule-strong py-4">
            <button
              type="button"
              onClick={() => setShowSpec(false)}
              className="field-label transition-colors hover:text-ink"
            >
              ← {t('common:form.backToFile')}
            </button>
            <div className="flex items-center gap-2">{chrome}</div>
          </div>
          <div className="pt-6">
            <ArchitectureViewer />
          </div>
        </div>
      ) : (
        <CampaignFile
          campaigns={campaigns}
          isLoading={isLoadingFile}
          onOpenCampaign={handleOpenCampaign}
          onCreateCampaign={handleCreateCampaign}
          lastOpenedId={lastOpenedId}
          onArchiveCampaign={handleArchiveCampaign}
          onDeleteCampaign={handleDeleteCampaign}
          isCreating={isCreating}
          isFiling={isFiling}
          onOpenSpec={() => setShowSpec(true)}
          chrome={chrome}
          onReplayTour={() => setTour('file')}
          modeSwitch={
            <ModeSwitch
              mode={mode}
              onChange={handleSwitchMode}
              demoCount={mode === 'DEMO' ? campaigns.length : otherModeCount}
              liveCount={mode === 'LIVE' ? campaigns.length : otherModeCount}
            />
          }
          mode={mode}
        />
      )}

      <Assistant open={assistantOpen} onClose={() => setAssistantOpen(false)} />

      <Settings
        open={settingsOpen}
        mode={mode}
        households={campaign ? billableHouseholds(campaign) : 5000}
        onClose={() => setSettingsOpen(false)}
        onCostsChanged={() => setCostsVersion((v) => v + 1)}
        onCostsChange={handleCostsChange}
      />
    </div>
  );
}
