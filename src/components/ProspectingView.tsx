import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Star,
  Phone,
  MapPin,
  Sparkles,
  CheckCircle,
  ExternalLink,
  Bot,
  Copy,
  Check,
  Filter,
} from 'lucide-react';
import { CLOSED_CATEGORIES } from '../data/categories.ts';
import { searchCategoryLeads, updateLeadStatus } from '../services/leadSourcingService.ts';
import { LeadProspect, SlotState } from '../types.ts';

interface ProspectingViewProps {
  targetCity: string;
  targetZip: string;
  slots: SlotState[];
  onAssignLeadToSlot: (slotNumber: number, lead: LeadProspect) => void;
  /** Slot the user arrived here to fill, coming from the canvas. */
  focusedSlotId?: number | null;
  /**
   * The niche that slot is being sold as. It is not always the slot number:
   * dragging an advertiser to another box moves their niche with them, so the
   * box to fill and the niche to search for are two different numbers.
   */
  focusedCategoryId?: number | null;
  onClearFocusedSlot?: () => void;
  /** Follows the app's world: mocks in the practice file, real APIs live. */
  mockMode: boolean;
}

export const ProspectingView: React.FC<ProspectingViewProps> = ({
  targetCity,
  targetZip,
  slots,
  onAssignLeadToSlot,
  focusedSlotId,
  focusedCategoryId,
  onClearFocusedSlot,
  mockMode,
}) => {
  const { t } = useTranslation(['prospecting', 'common']);

  /**
   * Which box a niche is sold in. Normally the box with the same number, but
   * once advertisers have been dragged around it is whichever box now carries
   * that niche — writing to the number would fill the wrong square.
   */
  const slotForCategory = (categoryId: number) =>
    slots.find((s) => s.categoryId === categoryId)?.slotNumber ?? categoryId;
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(
    focusedCategoryId ?? focusedSlotId ?? 1,
  );
  // Held here so the list reacts at once; the write to SQLite follows. A
  // refetch of the category must not silently discard the user's clicks.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, LeadProspect['status']>>(
    {},
  );
  const [leads, setLeads] = useState<LeadProspect[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedPitchId, setCopiedPitchId] = useState<string | null>(null);
  const [pitchLang, setPitchLang] = useState<'es' | 'en'>('es');

  // Follow the slot the canvas sent us to
  useEffect(() => {
    const target = focusedCategoryId ?? focusedSlotId;
    if (target != null) setSelectedCategoryId(target);
  }, [focusedSlotId, focusedCategoryId]);

  // Load leads for selected microzone and category
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    searchCategoryLeads(targetCity, targetZip, selectedCategoryId, mockMode)
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
  }, [targetCity, targetZip, selectedCategoryId, mockMode]);

  const selectedCategory =
    CLOSED_CATEGORIES.find((c) => c.id === selectedCategoryId) || CLOSED_CATEGORIES[0];
  const assignedSlot = slots.find((s) => s.slotNumber === selectedCategoryId);
  const currentSlotPrice = assignedSlot?.priceUsd ?? selectedCategory.priceUsd;
  const currentAvgTicket = assignedSlot?.avgTicketUsd ?? selectedCategory.avgTicketUsd;
  const breakevenDeals = Math.max(1, Math.ceil(currentSlotPrice / (currentAvgTicket || 1)));
  const breakevenRatio = (currentSlotPrice / (currentAvgTicket || 1)).toFixed(2);

  const handleUpdateStatus = (leadId: string, newStatus: 'CONTACTED' | 'REJECTED' | 'WON') => {
    setStatusOverrides((prev) => ({ ...prev, [leadId]: newStatus }));
    // A candidate that only exists in the client seed list has no row to
    // update, and a lost "contacted" does not deserve an error banner.
    updateLeadStatus(leadId, newStatus).catch(() => undefined);
  };

  const handleCopyPitch = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPitchId(id);
    setTimeout(() => setCopiedPitchId(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Context banner when the canvas sent us here to fill a specific slot */}
      {focusedSlotId != null && (
        <div className="flex items-center justify-between gap-3 border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-xs text-foreground">
            <span className="font-mono font-bold tabular-nums text-primary">
              SLOT {focusedSlotId}
            </span>
            <span className="mx-2 text-muted-foreground">·</span>
            {t('prospecting:focus.banner', {
              category: t(
                `common:categories.${focusedCategoryId ?? focusedSlotId}.name`,
                selectedCategory.name,
              ),
            })}
          </p>
          {onClearFocusedSlot && (
            <button
              id="btn-clear-focused-slot"
              type="button"
              onClick={onClearFocusedSlot}
              className="shrink-0 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {t('prospecting:focus.dismiss')}
            </button>
          )}
        </div>
      )}

      {/* The source is the app's world, chosen once in the drawer; this only
          reports which one is in force. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule pb-3">
        <span className="field-label">{t('prospecting:source.title')}</span>
        <span
          className={`border px-2 py-0.5 font-mono text-[0.63rem] font-bold ${
            mockMode
              ? 'border-live/40 bg-live/15 text-live'
              : 'border-clear/40 bg-clear/15 text-clear'
          }`}
        >
          {mockMode ? t('common:mode.demo') : t('common:mode.live')}
        </span>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {mockMode
            ? t('prospecting:source.mockDescription')
            : t('prospecting:source.liveDescription')}
        </p>
      </div>

      {/* Category selector pill strip */}
      <div className="bg-card border border-border p-4 text-card-foreground  transition-colors">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              {t('prospecting:categories.title')}
            </h3>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {t('prospecting:categories.subtitle')}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {CLOSED_CATEGORIES.map((cat) => {
            const slot = slots.find((s) => s.slotNumber === cat.id);
            const isPaid = slot?.status === 'PAID';
            const isReserved = slot?.status === 'RESERVED';
            const isSelected = selectedCategoryId === cat.id;
            const catName = t(`common:categories.${cat.id}.name`, cat.name);

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3 py-1.5 text-xs font-semibold whitespace-nowrap flex items-center space-x-1.5 border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary font-bold '
                    : 'bg-secondary text-secondary-foreground border-border hover:bg-muted'
                }`}
              >
                <span>#{cat.id}</span>
                <span>{catName}</span>
                {isPaid ? (
                  <span className="w-2 h-2  bg-clear inline-block"></span>
                ) : isReserved ? (
                  <span className="w-2 h-2  bg-live inline-block"></span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Sourcing Header Banner */}
      <div className="bg-card border border-border p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-card-foreground  transition-colors">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="font-mono font-bold text-primary">
              {t('prospecting:categories.slotPrefix', { id: selectedCategory.id })} •{' '}
              {selectedCategory.side === 'FRONT'
                ? t('prospecting:categories.frontSide')
                : t('prospecting:categories.backSide')}
            </span>
            <span>•</span>
            <span className="font-semibold text-foreground">
              {t('prospecting:categories.adCost', { price: currentSlotPrice })}
            </span>
            <span>•</span>
            <span className="font-semibold text-foreground">
              {t('prospecting:categories.avgTicket', { ticket: currentAvgTicket })}
            </span>
            <span>•</span>
            <span className="px-2 py-0.5 bg-live/15 text-live font-mono font-bold text-[0.63rem] border border-live/40">
              {t('prospecting:categories.breakevenBadge', {
                deals: breakevenDeals,
                clientText:
                  breakevenDeals === 1
                    ? t('prospecting:categories.oneClient')
                    : t('prospecting:categories.multiClients'),
                ratio: breakevenRatio,
              })}
            </span>
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {t(`common:categories.${selectedCategory.id}.name`, selectedCategory.name)}
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            {t(
              `common:categories.${selectedCategory.id}.description`,
              selectedCategory.description,
            )}
          </p>
        </div>

        {/* Slot Current Status Preview */}
        <div className="bg-secondary/60 p-3 border border-border text-xs flex flex-col items-end">
          <span className="text-muted-foreground text-[0.69rem]">
            {t('prospecting:categories.currentStatus', { id: selectedCategory.id })}
          </span>
          <span
            className={`font-bold uppercase tracking-wider mt-0.5 ${
              assignedSlot?.status === 'PAID'
                ? 'text-clear'
                : assignedSlot?.status === 'RESERVED'
                  ? 'text-live'
                  : assignedSlot?.status === 'PROSPECTING'
                    ? 'text-live font-bold'
                    : 'text-muted-foreground'
            }`}
          >
            {assignedSlot?.status
              ? t(`common:status.${assignedSlot.status.toLowerCase()}`, assignedSlot.status)
              : t('common:status.vacant')}
          </span>
          {assignedSlot?.businessName && (
            <span className="text-foreground font-medium truncate max-w-[200px]">
              {assignedSlot.businessName}
            </span>
          )}
        </div>
      </div>

      {/* Language Switcher for Local LLM Pitches */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground px-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="flex items-center space-x-2">
            <Bot className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-foreground">{t('prospecting:llama.title')}</span>
          </div>
          <span>
            {t('prospecting:llama.subtitle', {
              ticket: currentAvgTicket,
              deals: breakevenDeals,
              clientText:
                breakevenDeals === 1
                  ? t('prospecting:categories.oneClient')
                  : t('prospecting:categories.multiClients'),
            })}
          </span>
        </div>
        <div className="flex items-center space-x-1 bg-secondary p-1 border border-border">
          <button
            onClick={() => setPitchLang('es')}
            className={`px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors ${
              pitchLang === 'es'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('prospecting:llama.spanishBtn')}
          </button>
          <button
            onClick={() => setPitchLang('en')}
            className={`px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors ${
              pitchLang === 'en'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('prospecting:llama.englishBtn')}
          </button>
        </div>
      </div>

      {/* Leads List */}
      {loading ? (
        <div className="bg-card border border-border p-12 text-center text-muted-foreground space-y-3 ">
          <div className="w-8 h-8 border border-primary border-t-transparent  animate-spin mx-auto"></div>
          <p className="text-sm font-medium text-foreground">
            {t('prospecting:crm.loading', { city: targetCity })}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {t('prospecting:crm.loadingSub')}
          </p>
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-card border border-border p-8 text-center text-muted-foreground ">
          {t('prospecting:crm.noLeads', { city: targetCity })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {leads.map((lead, idx) => {
            const pitch = lead.bilingualHooks[pitchLang];
            const leadStatus = statusOverrides[lead.id] ?? lead.status;
            const isAssigned = assignedSlot?.businessName === lead.businessName;

            return (
              <div
                key={lead.id}
                className={`bg-card border p-5 transition-colors space-y-4  text-card-foreground ${
                  isAssigned
                    ? 'border-clear bg-clear/10  '
                    : leadStatus === 'REJECTED'
                      ? 'border-border opacity-60'
                      : 'border-border hover:border-accent'
                }`}
              >
                {/* Header row of lead */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-primary font-mono">
                        {t('prospecting:crm.top', { rank: idx + 1 })}
                      </span>
                      <h3 className="text-base font-bold text-foreground">{lead.businessName}</h3>
                      <span className="px-2 py-0.5 text-[0.63rem] font-mono bg-secondary text-secondary-foreground border border-border">
                        {lead.source}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {lead.rating != null && (
                        <div className="flex items-center space-x-1 text-live font-semibold">
                          <Star className="w-3.5 h-3.5 fill-live text-live" />
                          <span>{lead.rating}</span>
                          {lead.reviewCount != null && (
                            <span className="text-muted-foreground font-normal">
                              {t('prospecting:crm.reviews', { count: lead.reviewCount })}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center space-x-1">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>
                          {lead.address}, {lead.city}, CA {lead.zip || lead.zipCode}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                        <a
                          href={`tel:${lead.phone}`}
                          className="hover:text-primary transition-colors text-foreground"
                        >
                          {lead.phone}
                        </a>
                      </div>
                      {lead.websiteUrl && (
                        <a
                          href={lead.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center space-x-1 text-primary hover:underline transition-colors"
                          title={t('prospecting:crm.visitWebsite')}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[150px]">
                            {lead.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                          </span>
                        </a>
                      )}
                      {lead.category && (
                        <span className="px-1.5 py-0.5 text-[0.63rem] font-mono bg-secondary text-secondary-foreground border border-border">
                          tag: {lead.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Decision Maker & Status */}
                  <div className="flex flex-col items-start sm:items-end">
                    <span className="text-[0.69rem] text-muted-foreground">
                      {t('prospecting:crm.decisionMaker')}
                    </span>
                    <span className="text-xs font-semibold text-foreground font-mono">
                      {lead.decisionMaker}
                    </span>
                    <span className="text-[0.63rem] text-muted-foreground">
                      {lead.decisionMakerTitle}
                    </span>
                  </div>
                </div>

                {/* Local LLM Pitch Box */}
                <div className="bg-secondary/40 border border-border p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-primary flex items-center gap-1.5 font-mono">
                      <Sparkles className="w-3.5 h-3.5" />
                      {t('prospecting:llama.hookHeader', { lang: pitchLang.toUpperCase() })}
                    </span>
                    <button
                      onClick={() => handleCopyPitch(lead.id, pitch)}
                      className="flex items-center space-x-1 text-xs text-muted-foreground hover:text-foreground bg-card border border-border px-2 py-0.5 transition-colors cursor-pointer "
                    >
                      {copiedPitchId === lead.id ? (
                        <>
                          <Check className="w-3 h-3 text-clear" />
                          <span className="text-clear font-medium">
                            {t('prospecting:llama.copied')}
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{t('prospecting:llama.copyPitch')}</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed italic bg-card p-2.5 border border-border">
                    "{pitch}"
                  </p>
                  <p className="text-[0.69rem] text-muted-foreground font-mono">
                    <strong className="text-foreground">
                      {t('prospecting:llama.breakevenRoi')}
                    </strong>{' '}
                    {t('prospecting:llama.investment', { price: currentSlotPrice })} |{' '}
                    {t('prospecting:llama.ticket', { ticket: currentAvgTicket })} |
                    <span className="text-clear font-bold ml-1">
                      {t('prospecting:llama.equilibrium', {
                        deals: breakevenDeals,
                        clientText:
                          breakevenDeals === 1
                            ? t('prospecting:llama.oneNewClient')
                            : t('prospecting:llama.multiNewClients'),
                        ratio: breakevenRatio,
                      })}
                    </span>
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-muted-foreground">
                      {t('prospecting:crm.crmStatus')}
                    </span>
                    <button
                      onClick={() => handleUpdateStatus(lead.id, 'CONTACTED')}
                      className={`px-2.5 py-1 text-xs font-medium border transition-colors cursor-pointer ${
                        leadStatus === 'CONTACTED'
                          ? 'bg-secondary text-ink border-rule-strong'
                          : 'bg-secondary text-secondary-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {t('prospecting:crm.contacted')}
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(lead.id, 'REJECTED')}
                      className={`px-2.5 py-1 text-xs font-medium border transition-colors cursor-pointer ${
                        leadStatus === 'REJECTED'
                          ? 'bg-due/15 text-due border-due/40'
                          : 'bg-secondary text-secondary-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {t('prospecting:crm.rejected')}
                    </button>
                  </div>

                  {/* Assign to Slot button */}
                  <button
                    onClick={() => onAssignLeadToSlot(slotForCategory(selectedCategory.id), lead)}
                    className={`px-4 py-1.5 text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer  ${
                      isAssigned
                        ? 'bg-clear text-background cursor-default'
                        : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>
                      {isAssigned
                        ? t('prospecting:crm.assigned')
                        : t('prospecting:crm.assignSlot', { id: selectedCategory.id })}
                    </span>
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
