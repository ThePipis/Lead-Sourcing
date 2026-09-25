import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, Plus, Trash2, X } from 'lucide-react';
import { Campaign } from '../types.ts';
import { INLAND_EMPIRE_ZONES } from '../data/categories.ts';
import { getReachFloor } from '../services/routeService.ts';
import { computeProgress, collectedUsd, PHASE_ORDER, TOTAL_SLOTS } from '../workflow.ts';

type FilterId = 'ACTIVE' | 'ARCHIVED' | 'ALL';

interface CampaignFileProps {
  campaigns: Campaign[];
  isLoading: boolean;
  onOpenCampaign: (campaignId: string) => void;
  onCreateCampaign: (city: string, zip: string, households: number) => void;
  /** The campaign this operator last opened, if it is still in the file. */
  lastOpenedId: string | null;
  onArchiveCampaign: (campaignId: string, archived: boolean) => void;
  onDeleteCampaign: (campaignId: string) => void;
  isCreating: boolean;
  /** Set while an archive or delete is in flight. */
  isFiling: boolean;
  onOpenSpec: () => void;
  /** Language and stock controls, seated on the drawer's header rule. */
  chrome: React.ReactNode;
  onReplayTour: () => void;
  /** The world selector; it governs what this drawer lists. */
  modeSwitch: React.ReactNode;
  mode: 'DEMO' | 'LIVE';
}

const money = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

/**
 * Four cells, one per section, printed the way a form shows which blocks are
 * already stamped. Filled = done, hollow = open, hatched = still gated.
 */
const SectionStrip: React.FC<{ campaign: Campaign }> = ({ campaign }) => {
  const { t } = useTranslation(['common']);
  const progress = useMemo(() => computeProgress(campaign, campaign.curatedCount ?? 0), [campaign]);

  return (
    <div
      className="flex items-center gap-px"
      role="img"
      aria-label={t('common:file.sectionsDone', {
        done: progress.completedCount,
        total: PHASE_ORDER.length,
      })}
    >
      {progress.phases.map((p) => (
        <span
          key={p.id}
          title={t(`common:form.section.${p.id}`)}
          className={`h-[18px] w-[18px] border text-[0.5rem] font-mono leading-[16px] text-center tabular-nums sm:h-5 sm:w-5 sm:text-[0.56rem] sm:leading-[18px] ${
            p.done
              ? 'border-clear bg-clear text-background'
              : p.open
                ? 'border-rule-strong text-ink-dim'
                : 'border-rule text-ink-faint reserved'
          }`}
        >
          {p.number}
        </span>
      ))}
    </div>
  );
};

/**
 * The drawer: what to work on now, and the index of everything else.
 *
 * A campaign file only grows — one drop per microzone per month adds up — so
 * the index is a fixed-height drawer with its own scroll rather than a list
 * that pushes the page down. The screen stays one screen: the campaign that
 * owes work is the first thing seen, and the index below it never changes the
 * page's height no matter how many drops are on file.
 *
 * Campaigns are managed here too, because a second place to look for the same
 * campaigns would be one place too many.
 */
export const CampaignFile: React.FC<CampaignFileProps> = ({
  campaigns,
  isLoading,
  onOpenCampaign,
  onCreateCampaign,
  lastOpenedId,
  onArchiveCampaign,
  onDeleteCampaign,
  isCreating,
  isFiling,
  onOpenSpec,
  chrome,
  onReplayTour,
  modeSwitch,
  mode,
}) => {
  const { t } = useTranslation(['common']);
  const [newZone, setNewZone] = useState('');
  // The drop size drives both the slot prices and the print cost, so it is
  // chosen when the campaign is opened, before anything is sold.
  const [newHouseholds, setNewHouseholds] = useState('5000');
  const [filter, setFilter] = useState<FilterId>('ACTIVE');
  const [showNew, setShowNew] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const active = useMemo(() => campaigns.filter((c) => !c.archivedAt), [campaigns]);
  const archived = useMemo(() => campaigns.filter((c) => c.archivedAt), [campaigns]);
  const counts: Record<FilterId, number> = {
    ACTIVE: active.length,
    ARCHIVED: archived.length,
    ALL: campaigns.length,
  };

  const existingZips = new Set(campaigns.map((c) => c.targetZip));
  const availableZones = INLAND_EMPIRE_ZONES.filter((z) => !existingZips.has(z.zip));

  // One campaign is lifted to the top of the drawer as a card, and it is the one
  // this operator opened last: opening a form is the act of picking up a job, so
  // it is the only honest signal of what is in hand. Before anything has been
  // opened — a fresh browser, a file just loaded — the most advanced unmailed
  // campaign stands in, which is the best guess available.
  //
  // The card is a shortcut to that work, not a different place where a campaign
  // lives, so it stays in the index too. Leaving it out made the counts lie and
  // made that one campaign the only one that could not be archived or deleted.
  // An archived campaign never leads: it was filed away on purpose.
  const ordered = useMemo(() => {
    const scored = active.map((c) => ({
      c,
      progress: computeProgress(c, c.curatedCount ?? 0),
    }));
    const open = scored.filter((s) => s.c.status !== 'MAILED');
    open.sort((a, b) => b.progress.completedCount - a.progress.completedCount);
    const closed = scored.filter((s) => s.c.status === 'MAILED');
    const activeOrdered = [...open, ...closed].map((s) => s.c);

    // The remembered id may point at a campaign that was archived, deleted, or
    // belongs to the other world; in every one of those cases it is ignored.
    const remembered = activeOrdered.find((c) => c.id === lastOpenedId);
    const lead = remembered ?? open[0]?.c;

    // The one on the card heads the index too, so the two readings of the file
    // agree. The order only changes when a form is opened, which is the moment
    // the operator is leaving this screen anyway.
    return {
      lead,
      activeOrdered: lead
        ? [lead, ...activeOrdered.filter((c) => c.id !== lead.id)]
        : activeOrdered,
    };
  }, [active, lastOpenedId]);

  const listed = useMemo(() => {
    if (filter === 'ARCHIVED') return archived;
    if (filter === 'ALL') return [...ordered.activeOrdered, ...archived];
    return ordered.activeOrdered;
  }, [filter, ordered.activeOrdered, archived]);

  // An empty file has nothing to browse, so the only thing on screen is how to
  // start one. While the file is still loading it is empty for the wrong
  // reason, which is why this waits for the load to finish.
  const fileEmpty = campaigns.length === 0;
  useEffect(() => {
    if (!isLoading) setShowNew(fileEmpty);
  }, [isLoading, fileEmpty]);

  /**
   * The smallest drop the chosen microzone can physically take.
   *
   * A carrier walks whole routes, so the floor is not a policy this form gets
   * to set: it is the smallest route in that ZIP. Until a microzone is picked
   * there is no ZIP and no floor, and if the USPS cannot be reached the field
   * says so rather than quietly accepting a number the post office would round
   * up anyway.
   */
  const [floor, setFloor] = useState<number | null>(null);
  const [floorState, setFloorState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const zoneZip = newZone.split('|')[1] ?? '';

  useEffect(() => {
    if (!zoneZip) {
      setFloor(null);
      setFloorState('idle');
      return;
    }
    let alive = true;
    setFloorState('loading');
    getReachFloor(zoneZip)
      .then((f) => {
        if (!alive) return;
        setFloor(f.smallestRoute);
        setFloorState('ready');
        // A default below the floor is not a smaller drop, it is the same drop
        // with a smaller number written beside it. Lift it.
        setNewHouseholds((current) =>
          Number(current) < f.smallestRoute ? String(f.smallestRoute) : current,
        );
      })
      .catch(() => {
        if (!alive) return;
        setFloor(null);
        setFloorState('failed');
      });
    return () => {
      alive = false;
    };
  }, [zoneZip]);

  const minHouseholds = floor ?? 508;
  const households = Number(newHouseholds);
  const householdsValid =
    Number.isFinite(households) && households >= minHouseholds && households <= 50000;

  const handleBlurHouseholds = () => {
    const val = Number(newHouseholds);
    let clamped: number;
    if (!Number.isFinite(val) || val < minHouseholds) {
      clamped = minHouseholds;
    } else if (val > 50000) {
      clamped = 50000;
    } else {
      clamped = Math.round(val);
    }
    setNewHouseholds(String(clamped));
  };

  const handleCreate = () => {
    const zone = INLAND_EMPIRE_ZONES.find((z) => `${z.city}|${z.zip}` === newZone);
    if (!zone || !householdsValid) return;
    onCreateCampaign(zone.city, zone.zip, households);
    setNewZone('');
    setShowNew(false);
  };

  if (isLoading) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="field-label">{t('common:file.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-3 sm:px-6 pb-8">
      <header className="border-b border-rule-strong pb-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 sm:gap-x-4 gap-y-2 sm:gap-y-3">
          <h1 data-tour="file-title" className="imperative text-lg text-ink">
            {t('common:file.title')}
          </h1>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="font-mono text-[0.69rem] tabular-nums text-ink-dim">
              {t('common:file.count', { count: campaigns.length })}
            </span>
            {chrome}
          </div>
        </div>
        <p className="mt-2 max-w-[68ch] text-xs text-ink-dim">{t('common:file.subtitle')}</p>
      </header>

      <div data-tour="mode-switch" className="mt-4">
        {modeSwitch}
      </div>

      {ordered.lead && (
        <LeadRow campaign={ordered.lead} onOpen={() => onOpenCampaign(ordered.lead!.id)} />
      )}

      {!fileEmpty && (
        <section className="mt-5 border border-rule bg-background">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-rule px-3 py-1.5">
            <div
              data-tour="file-filters"
              role="tablist"
              aria-label={t('common:file.indexTitle')}
              className="flex gap-px overflow-x-auto max-w-full"
            >
              {(['ACTIVE', 'ARCHIVED', 'ALL'] as FilterId[]).map((id) => (
                <button
                  key={id}
                  id={`btn-filter-${id.toLowerCase()}`}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={`field-label flex min-h-11 items-center gap-1.5 px-3 transition-colors ${
                    filter === id
                      ? 'bg-secondary text-ink'
                      : 'text-ink-dim hover:bg-secondary hover:text-ink'
                  }`}
                >
                  {t(`common:file.filters.${id.toLowerCase()}`)}
                  <span className="font-mono text-[0.63rem] tabular-nums opacity-70">
                    {counts[id]}
                  </span>
                </button>
              ))}
            </div>

            <button
              id="btn-toggle-new"
              type="button"
              data-tour="new-campaign"
              aria-expanded={showNew}
              onClick={() => setShowNew((v) => !v)}
              className="field-label flex min-h-11 items-center gap-1.5 px-3 text-live transition-colors hover:bg-secondary"
            >
              {showNew ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {t(showNew ? 'common:file.newClose' : 'common:file.newToggle')}
            </button>
          </div>

          {/* The index scrolls inside its own frame: the file can hold fifty
              drops without the page ever getting taller. */}
          <div className="max-h-[15.5rem] overflow-y-auto overscroll-contain">
            {listed.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-ink-dim">
                {t(filter === 'ARCHIVED' ? 'common:file.emptyArchived' : 'common:file.emptyIndex')}
              </p>
            ) : (
              <ul>
                {listed.map((c) => (
                  <FileRow
                    key={c.id}
                    campaign={c}
                    isLead={c.id === ordered.lead?.id}
                    mode={mode}
                    isFiling={isFiling}
                    confirming={confirmingDelete === c.id}
                    onConfirmDelete={() => setConfirmingDelete(c.id)}
                    onCancelDelete={() => setConfirmingDelete(null)}
                    onOpen={() => onOpenCampaign(c.id)}
                    onArchive={() => onArchiveCampaign(c.id, !c.archivedAt)}
                    onDelete={() => {
                      setConfirmingDelete(null);
                      onDeleteCampaign(c.id);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {showNew && (
        // The tour's anchor lives on the toggle above when there is an index to
        // hang it from, and here when the file is empty and the toggle does not
        // exist — the step explaining how to start is the one an empty file
        // needs most.
        <div data-tour="new-campaign" className="mt-4 border border-rule bg-card p-4">
          {fileEmpty && (
            <>
              <h2 className="imperative text-sm text-ink">
                {t(mode === 'LIVE' ? 'common:file.emptyLiveTitle' : 'common:file.emptyDemoTitle')}
              </h2>
              <p className="mt-2 mb-4 max-w-[62ch] text-xs leading-relaxed text-ink-dim">
                {t(mode === 'LIVE' ? 'common:file.emptyLiveBody' : 'common:file.emptyDemoBody')}
              </p>
            </>
          )}
          <h3 className="field-label text-ink">{t('common:file.newLabel')}</h3>
          <div className="mt-2.5 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="min-w-0">
              <label
                className="field-label mb-1.5 block text-[0.65rem]"
                htmlFor="new-campaign-zone"
              >
                {t('common:header.microzoneLabel')}
              </label>
              <select
                id="new-campaign-zone"
                value={newZone}
                onChange={(e) => setNewZone(e.target.value)}
                disabled={availableZones.length === 0}
                className="field-value w-full min-w-0 border border-rule bg-background px-3 py-2 text-xs disabled:opacity-50"
              >
                <option value="">
                  {availableZones.length === 0
                    ? t('common:file.allZonesUsed')
                    : t('common:file.pickZone')}
                </option>
                {availableZones.map((z) => (
                  <option key={z.zip} value={`${z.city}|${z.zip}`}>
                    {z.city} · {z.zip} · {z.county}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="field-label mb-1.5 block text-[0.65rem]"
                htmlFor="new-campaign-households"
              >
                {t('common:file.sizeLabel')}
              </label>
              <input
                id="new-campaign-households"
                type="number"
                inputMode="numeric"
                min={minHouseholds}
                max={50000}
                step={5}
                value={newHouseholds}
                onChange={(e) => setNewHouseholds(e.target.value)}
                onBlur={handleBlurHouseholds}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleBlurHouseholds();
                    e.currentTarget.blur();
                  }
                }}
                aria-describedby="new-campaign-size-hint"
                aria-invalid={!householdsValid}
                className={`field-value w-full border bg-background px-3 py-2 text-xs sm:w-36 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                  householdsValid ? 'border-rule' : 'border-due'
                }`}
              />
            </div>
            <button
              id="btn-create-campaign"
              type="button"
              onClick={handleCreate}
              disabled={!newZone || !householdsValid || isCreating}
              className="imperative min-h-11 border border-live bg-live px-4 text-[0.69rem] text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isCreating ? t('common:file.creating') : t('common:file.create')}
            </button>
          </div>

          <p id="new-campaign-size-hint" className="mt-2 max-w-[68ch] text-xs text-ink-dim">
            {floorState === 'ready' && floor
              ? t('common:file.sizeHintFloor', {
                  floor: floor.toLocaleString('en-US'),
                  zip: zoneZip,
                })
              : floorState === 'failed'
                ? t('common:file.sizeHintNoFloor', { zip: zoneZip })
                : floorState === 'loading'
                  ? t('common:file.sizeHintLoading', { zip: zoneZip })
                  : t('common:file.sizeHint')}
          </p>
        </div>
      )}

      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
        <span className="font-mono text-[0.69rem] text-ink-faint">{t('common:footer.specs')}</span>
        <div className="flex items-center gap-5">
          <button
            id="btn-replay-tour"
            type="button"
            onClick={onReplayTour}
            className="field-label text-live transition-colors hover:text-ink"
          >
            {t('common:tour.replay')}
          </button>
          <button
            id="btn-open-spec"
            type="button"
            onClick={onOpenSpec}
            className="field-label transition-colors hover:text-ink"
          >
            {t('common:file.spec')} →
          </button>
        </div>
      </footer>
    </div>
  );
};

/** The campaign that owes work, opened flat with its single imperative. */
const LeadRow: React.FC<{ campaign: Campaign; onOpen: () => void }> = ({ campaign, onOpen }) => {
  const { t } = useTranslation(['common']);
  const progress = computeProgress(campaign, campaign.curatedCount ?? 0);
  const collected = collectedUsd(campaign);
  const owedSlots = campaign.slots.filter((s) => s.status !== 'PAID').length;

  return (
    <section className="mt-4 border border-live/60 bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <span className="field-value text-base text-ink">{campaign.code}</span>
          <span className="field-label">{campaign.targetCity}</span>
        </div>
        <span data-tour="lead-strip">
          <SectionStrip campaign={campaign} />
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-px border-b border-rule bg-rule sm:grid-cols-4">
        <Cell label={t('common:file.collected')} value={money(collected)} />
        <Cell
          label={t('common:file.slotsOwed')}
          value={String(owedSlots)}
          tone={owedSlots > 0 ? 'due' : 'clear'}
          tour="owed"
        />
        <Cell
          label={t('common:file.households')}
          value={(campaign.curatedCount ?? 0).toLocaleString('en-US')}
        />
        <Cell label={t('common:file.zip')} value={campaign.targetZip} />
      </dl>

      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t('common:file.open')} ${campaign.code}`}
        className="group flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-secondary"
      >
        <span
          data-tour="lead-imperative"
          className="imperative min-w-0 text-sm text-live sm:text-base"
        >
          {t(`common:${progress.imperativeKey}`, progress.imperativeParams)}
        </span>
        <span className="field-label shrink-0 text-live">{t('common:file.open')} →</span>
      </button>
    </section>
  );
};

const Cell: React.FC<{
  label: string;
  value: string;
  tone?: 'due' | 'clear';
  /** `data-tour` anchor, when the walkthrough points at this cell. */
  tour?: string;
}> = ({ label, value, tone, tour }) => (
  <div data-tour={tour} className="bg-card px-4 py-2.5">
    <dt className="field-label">{label}</dt>
    <dd
      className={`field-value mt-0.5 text-sm ${
        tone === 'due' ? 'text-due' : tone === 'clear' ? 'text-clear' : 'text-ink'
      }`}
    >
      {value}
    </dd>
  </div>
);

interface FileRowProps {
  campaign: Campaign;
  /** The one shown as a card above, marked so it does not read as a duplicate. */
  isLead: boolean;
  mode: 'DEMO' | 'LIVE';
  isFiling: boolean;
  confirming: boolean;
  onOpen: () => void;
  onArchive: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}

/**
 * One ruled line in the index, with what it takes to manage it.
 *
 * Deleting is deliberately not symmetrical between the two worlds. A practice
 * campaign can always go — the drawer promises that nothing there has
 * consequences. A live one is refused on exactly two counts: money already
 * collected, or a drop already printed. Both are irreversible records of what an
 * advertiser bought, and both archive instead, with the control saying so up
 * front rather than failing after the click.
 *
 * A merely reserved slot does not block it. A name typed into a box is not a
 * transaction, and an abandoned campaign carrying one still has to be removable.
 */
const FileRow: React.FC<FileRowProps> = ({
  campaign,
  isLead,
  mode,
  isFiling,
  confirming,
  onOpen,
  onArchive,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
}) => {
  const { t } = useTranslation(['common']);
  const paid = campaign.slots.filter(
    (s) => s.status === 'PAID' && s.format !== 'USPS' && s.slotNumber !== 32,
  ).length;
  const owed = Math.max(0, TOTAL_SLOTS - paid);
  const mailed = campaign.status === 'MAILED';
  const isArchived = Boolean(campaign.archivedAt);

  const holdsMoneyOrPrint = paid > 0 || campaign.status === 'IN_PRODUCTION' || mailed;
  const deletable = mode === 'DEMO' || !holdsMoneyOrPrint;

  return (
    <li className="flex items-center border-b border-rule last:border-b-0">
      <button
        type="button"
        aria-label={`${t('common:file.open')} ${campaign.code}`}
        onClick={onOpen}
        className={`flex min-h-11 min-w-0 flex-1 items-center gap-x-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary ${
          isArchived ? 'opacity-60' : ''
        }`}
      >
        {/* Narrow widths drop city and ZIP. What the campaign owes never goes:
            it is the reason to open the row at all. */}
        <span className="field-value min-w-0 flex-1 truncate text-xs text-ink sm:w-52 sm:flex-none sm:text-sm">
          {campaign.code}
        </span>
        <span className="field-label hidden w-28 shrink-0 normal-case tracking-normal md:block">
          {campaign.targetCity}
        </span>
        <span className="field-value hidden w-14 shrink-0 text-xs text-ink-dim lg:block">
          {campaign.targetZip}
        </span>
        <span
          className={`field-value w-12 shrink-0 text-xs ${owed > 0 ? 'text-due' : 'text-clear'}`}
          title={t('common:file.slotsOwed')}
        >
          {paid}/{TOTAL_SLOTS}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {isLead && !isArchived && (
            <span className="field-label hidden text-live sm:inline">
              {t('common:file.leadTag')}
            </span>
          )}
          {isArchived ? (
            <span className="field-label hidden text-ink-faint sm:inline">
              {t('common:file.archivedTag')}
            </span>
          ) : (
            mailed && (
              <span className="field-label hidden text-clear sm:inline">
                {t('common:file.mailed')}
              </span>
            )
          )}
          <SectionStrip campaign={campaign} />
        </span>
      </button>

      {confirming ? (
        <span className="flex shrink-0 items-center gap-1 pr-2 pl-1">
          <span className="field-label hidden text-due sm:inline">
            {t('common:file.confirmDelete')}
          </span>
          <button
            type="button"
            onClick={onDelete}
            disabled={isFiling}
            className="field-label min-h-11 px-2 text-due transition-colors hover:bg-due hover:text-background disabled:opacity-40"
          >
            {t('common:file.confirmYes')}
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            className="field-label min-h-11 px-2 text-ink-dim transition-colors hover:text-ink"
          >
            {t('common:file.confirmNo')}
          </button>
        </span>
      ) : (
        <span data-tour="row-actions" className="flex shrink-0 items-center pr-1">
          <button
            type="button"
            onClick={onArchive}
            disabled={isFiling}
            title={t(isArchived ? 'common:file.unarchive' : 'common:file.archive')}
            aria-label={`${t(isArchived ? 'common:file.unarchive' : 'common:file.archive')} ${campaign.code}`}
            className="flex min-h-11 min-w-11 items-center justify-center text-ink-faint transition-colors hover:bg-secondary hover:text-ink disabled:opacity-40"
          >
            {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={isFiling || !deletable}
            title={t(deletable ? 'common:file.delete' : 'common:file.deleteBlocked')}
            aria-label={`${t('common:file.delete')} ${campaign.code}`}
            className="flex min-h-11 min-w-11 items-center justify-center text-ink-faint transition-colors hover:bg-secondary hover:text-due disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </span>
      )}
    </li>
  );
};
