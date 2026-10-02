import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  FileDown,
  Home,
  Smartphone,
  BarChart,
  Copy,
  Check,
  QrCode,
} from 'lucide-react';
import { Campaign, SlotState } from '../types.ts';
import {
  generateCampaignQrCodes,
  GeneratedQrData,
  resolveTrackingBase,
} from '../services/postalExportService.ts';
import {
  campaignRouteManifestUrl,
  fetchRouteProfile,
  getCampaignRoutes,
  RouteProfile,
} from '../services/routeService.ts';

interface PostalExportViewProps {
  campaign: Campaign;
  slots: SlotState[];
  onIncrementScan: (slotNumber: number) => void;
  /**
   * The manifest and the QR telemetry belong to different sections of the
   * form: section 4 cuts the CSV, section 5 reports what came back.
   */
  section?: 'manifest' | 'telemetry' | 'all';
  /** Section 4 closing stamp: the printer has the file. */
  onDeliveredToPrinter?: () => void;
  isSaving?: boolean;
  /** Saves where a slot's QR redirects (the slot's website). */
  onSetDestination?: (slotNumber: number, url: string) => Promise<void>;
}

interface ScanEvent {
  id: string;
  slot_number: number;
  business_name: string;
  timestamp: string | null;
  device_type: string | null;
  user_agent: string | null;
  ip_hash: string | null;
  client_ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  isp: string | null;
  is_test: boolean;
}

/** The reader's IP with the last part hidden: enough to verify, not to identify. */
function maskIp(ip: string | null): string {
  if (!ip) return '—';
  if (ip.includes('.')) return ip.split('.').slice(0, 3).join('.') + '.xxx';
  return ip.split(':').slice(0, 4).join(':') + ':xxxx';
}

/** "iPhone · iOS 18.1 · Safari" from the scanning phone's user agent. */
function describeDevice(ua: string | null, fallback: string | null): string {
  if (!ua) return fallback || '—';
  const os =
    ua.match(/iPhone OS (\d+[_\d]*)/)?.[1]?.replace(/_/g, '.') !== undefined
      ? `iPhone · iOS ${ua.match(/iPhone OS (\d+[_\d]*)/)![1].replace(/_/g, '.')}`
      : /iPad/.test(ua)
        ? 'iPad'
        : ua.match(/Android (\d+(\.\d+)?)/)
          ? `Android ${ua.match(/Android (\d+(\.\d+)?)/)![1]}${ua.match(/; ([^;)]+) Build/) ? ` · ${ua.match(/; ([^;)]+) Build/)![1]}` : ''}`
          : /Windows/.test(ua)
            ? 'Windows'
            : /Mac OS X/.test(ua)
              ? 'Mac'
              : fallback || '—';
  const browser = /Instagram/.test(ua)
    ? 'Instagram'
    : /FBAN|FBAV/.test(ua)
      ? 'Facebook'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /CriOS|Chrome\//.test(ua) && !/Edg\//.test(ua)
          ? 'Chrome'
          : /Edg\//.test(ua)
            ? 'Edge'
            : /Firefox|FxiOS/.test(ua)
              ? 'Firefox'
              : /Safari\//.test(ua)
                ? 'Safari'
                : '';
  return browser ? `${os} · ${browser}` : os;
}

export const PostalExportView: React.FC<PostalExportViewProps> = ({
  campaign,
  slots,
  onIncrementScan,
  section = 'all',
  onDeliveredToPrinter,
  isSaving = false,
  onSetDestination,
}) => {
  const { t, i18n } = useTranslation(['export', 'common']);
  const [qrList, setQrList] = useState<GeneratedQrData[]>([]);
  const [selectedQr, setSelectedQr] = useState<GeneratedQrData | null>(null);
  // Real scans, straight from the tracking table and refreshed while the panel
  // is open, so a phone scan shows up within seconds without reloading.
  const [scanEvents, setScanEvents] = useState<ScanEvent[]>([]);
  const loadScans = React.useCallback(() => {
    fetch(`/r/events?campaign_id=${encodeURIComponent(campaign.id)}&limit=500`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setScanEvents(Array.isArray(rows) ? rows : []))
      .catch(() => undefined);
  }, [campaign.id]);
  useEffect(() => {
    if (section === 'manifest') return;
    loadScans();
    const id = window.setInterval(loadScans, 5000);
    return () => window.clearInterval(id);
  }, [loadScans, section]);
  const scansBySlot = scanEvents.reduce<Record<number, number>>((acc, e) => {
    acc[e.slot_number] = (acc[e.slot_number] ?? 0) + 1;
    return acc;
  }, {});
  // First scan of each device per slot is a unique visitor; later ones are repeats.
  const repeatIds = new Set<string>();
  {
    const seen = new Set<string>();
    [...scanEvents].reverse().forEach((e) => {
      const key = `${e.slot_number}|${e.ip_hash}|${e.user_agent}`;
      if (seen.has(key)) repeatIds.add(e.id);
      seen.add(key);
    });
  }
  const realScans = scanEvents.filter((e) => !e.is_test);
  const exportUrl = (slotNumber?: number) =>
    `/r/events/export?campaign_id=${encodeURIComponent(campaign.id)}${slotNumber !== undefined ? `&slot_number=${slotNumber}` : ''}`;
  const [clearingTests, setClearingTests] = useState(false);
  const handleClearAll = async () => {
    if (!window.confirm(t('export:telemetry.clearAllConfirm', { code: campaign.code }))) return;
    setClearingTests(true);
    try {
      await fetch(`/r/events?campaign_id=${encodeURIComponent(campaign.id)}`, { method: 'DELETE' });
      loadScans();
    } finally {
      setClearingTests(false);
    }
  };
  const handleClearTests = async () => {
    if (!window.confirm(t('export:telemetry.clearConfirm'))) return;
    setClearingTests(true);
    try {
      await fetch(`/r/events/tests?campaign_id=${encodeURIComponent(campaign.id)}`, { method: 'DELETE' });
      loadScans();
    } finally {
      setClearingTests(false);
    }
  };
  const uniqueReal = realScans.filter((e) => !repeatIds.has(e.id)).length;
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [profile, setProfile] = useState<RouteProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  // The drop's real size, straight from the selected routes. It is what the
  // postage is billed on, so it does not wait on the county: the profile can
  // come back empty and this still has to be right.
  const [selectedRoutes, setSelectedRoutes] = useState(0);
  const [coveredHouseholds, setCoveredHouseholds] = useState(0);
  const [routesLoading, setRoutesLoading] = useState(true);

  // Generate QR codes on mount or when slots change
  useEffect(() => {
    let isMounted = true;
    resolveTrackingBase()
      .then((base) => generateCampaignQrCodes(campaign.id, slots, base))
      .then((list) => {
      if (isMounted) {
        setQrList(list);
        // Keep the selection on the same slot, with its fresh destination.
        setSelectedQr((prev) => list.find((q) => q.slotNumber === prev?.slotNumber) ?? list[0] ?? null);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [campaign.id, slots]);

  // The routes first, because they are cheap and authoritative. The county
  // parcel roll is a slow second call and is allowed to fail: a profile that
  // never arrives is reported as unavailable, never as a zero.
  useEffect(() => {
    let alive = true;
    setRoutesLoading(true);
    getCampaignRoutes(campaign.id)
      .then((plan) => {
        if (!alive) return;
        setSelectedRoutes(plan.selectedRoutes);
        setCoveredHouseholds(plan.covered);
      })
      .catch(() => undefined)
      .finally(() => alive && setRoutesLoading(false));
    return () => {
      alive = false;
    };
  }, [campaign.id]);

  useEffect(() => {
    if (selectedRoutes === 0) {
      setProfile(null);
      return;
    }
    let alive = true;
    setProfileLoading(true);
    fetchRouteProfile(campaign.id)
      .then((p) => alive && setProfile(p))
      .catch(() => alive && setProfile(null))
      .finally(() => alive && setProfileLoading(false));
    return () => {
      alive = false;
    };
  }, [campaign.id, selectedRoutes]);

  // A simulated scan goes through the real tracking link from this PC, so it is
  // stored like any scan and flagged as a test by its local address.
  const handleSimulateScan = async (qr: GeneratedQrData) => {
    await fetch(`/r/${encodeURIComponent(campaign.id)}/slot-${qr.slotNumber}`, { redirect: 'manual' }).catch(
      () => undefined,
    );
    window.setTimeout(loadScans, 1500);
  };

  // The printed QR always encodes the tracking URL, so a scan is counted before
  // it is forwarded; what the operator sets here is only where it is forwarded to.
  const [destDraft, setDestDraft] = useState('');
  const [editingDest, setEditingDest] = useState(false);
  const [savingDest, setSavingDest] = useState(false);
  useEffect(() => {
    setDestDraft(selectedQr?.destination ?? '');
    setEditingDest(false);
  }, [selectedQr?.slotNumber]);

  const handleSaveDestination = async () => {
    const raw = destDraft.trim();
    if (!selectedQr || !raw || !onSetDestination) return;
    const url = /^(https?:|tel:)/i.test(raw) ? raw : `https://${raw}`;
    setSavingDest(true);
    try {
      await onSetDestination(selectedQr.slotNumber, url);
      setEditingDest(false);
    } finally {
      setSavingDest(false);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const showManifest = section === 'manifest' || section === 'all';
  const showTelemetry = section === 'telemetry' || section === 'all';
  const deliveredToPrinter = campaign.status === 'IN_PRODUCTION' || campaign.status === 'MAILED';
  const availableHouseholds = coveredHouseholds;

  return (
    <div className="space-y-6">
      {showManifest && (
        <>
          {/* ------------------------------------------------------------ *
              Two files leave this section and they are not interchangeable.
              One is what the printer and the post office act on; the other is
              what the advertiser is shown. Mixing them is how a neighbourhood
              study ends up on a loading dock as a delivery list, so each one
              says on its face what it is and where it goes.
           * ------------------------------------------------------------ */}

          {/* FILE 1 — the operative one */}
          <section className="border border-clear/50 bg-card text-card-foreground">
            <header className="flex flex-wrap items-center gap-2 border-b border-clear/30 bg-clear/10 px-5 py-2.5">
              <FileDown className="h-4 w-4 shrink-0 text-clear" />
              <h3 className="text-sm font-bold text-clear uppercase tracking-wider">
                {t('export:routeManifest.title')}
              </h3>
              <span className="border border-clear/40 bg-clear/15 px-2 py-0.5 font-mono text-[0.63rem] font-bold text-clear">
                {t('export:routeManifest.badge')}
              </span>
            </header>

            <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <p className="max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
                  {t('export:routeManifest.description')}
                </p>
                <p className="mt-2 font-mono text-[0.69rem] tabular-nums text-foreground">
                  {routesLoading
                    ? t('export:routeManifest.loading')
                    : selectedRoutes > 0
                      ? t('export:routeManifest.summary', {
                          routes: selectedRoutes,
                          households: coveredHouseholds.toLocaleString('en-US'),
                        })
                      : t('export:routeManifest.noRoutes')}
                </p>
              </div>

              <a
                id="btn-download-route-manifest"
                href={campaignRouteManifestUrl(campaign.id)}
                download
                aria-disabled={selectedRoutes === 0}
                className={`flex shrink-0 items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-opacity ${
                  selectedRoutes === 0
                    ? 'pointer-events-none bg-secondary text-muted-foreground opacity-50'
                    : 'bg-clear text-background hover:opacity-90'
                }`}
              >
                <Download className="h-4 w-4" />
                <span>{t('export:routeManifest.download')}</span>
              </a>
            </div>
          </section>

          {/* FILE 2 — the evidence, which never leaves for the post office */}
          <section className="border border-border bg-card text-card-foreground">
            <header className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/50 px-5 py-2.5">
              <Home className="h-4 w-4 shrink-0 text-primary" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                {t('export:profile.title')}
              </h3>
              <span className="border border-border bg-secondary px-2 py-0.5 font-mono text-[0.63rem] font-bold text-secondary-foreground">
                {t('export:profile.badge')}
              </span>
            </header>

            <div className="space-y-4 p-5">
              <p className="max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
                {t('export:profile.description')}
              </p>

              {profileLoading ? (
                <p className="flex items-center gap-2 py-6 font-mono text-xs text-muted-foreground">
                  <span className="h-3 w-3 animate-spin border border-primary border-t-transparent" />
                  {t('export:profile.loading')}
                </p>
              ) : !profile ? (
                <p className="border border-border bg-secondary/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                  {selectedRoutes === 0
                    ? t('export:profile.noRoutes')
                    : t('export:profile.unavailable')}
                </p>
              ) : (
                <>
                  <dl className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
                    {(
                      [
                        [
                          'profile.singleFamily',
                          profile.singleFamilyRate != null
                            ? `${Math.round(profile.singleFamilyRate * 100)}%`
                            : '—',
                        ],
                        [
                          'profile.medianValue',
                          profile.medianValue != null
                            ? `$${profile.medianValue.toLocaleString('en-US')}`
                            : '—',
                        ],
                        [
                          'profile.medianAge',
                          profile.medianAgeYears != null
                            ? t('export:profile.years', { count: profile.medianAgeYears })
                            : '—',
                        ],
                        ['profile.sampled', profile.parcelsSampled.toLocaleString('en-US')],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="bg-card px-4 py-3">
                        <dt className="field-label">{t(`export:${label}`)}</dt>
                        <dd className="field-value mt-1 font-mono text-sm tabular-nums text-ink">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {profile.classBreakdown.length > 0 && (
                    <ul className="space-y-1">
                      {profile.classBreakdown.map((c) => (
                        <li
                          key={c.classCode}
                          className="flex items-baseline justify-between gap-3 border-b border-rule pb-1 text-xs"
                        >
                          <span className="min-w-0 truncate text-foreground">{c.classCode}</span>
                          <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                            {c.count.toLocaleString('en-US')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* The sample is smaller than the drop, and saying so is the
                      point: the ratios describe the housing, the USPS count is
                      what gets mailed and billed. */}
                  <p className="border-t border-rule pt-3 font-mono text-[0.69rem] leading-relaxed text-ink-faint">
                    {t('export:profile.footnote', {
                      households: profile.households.toLocaleString('en-US'),
                      routes: profile.routes,
                      sampled: profile.parcelsSampled.toLocaleString('en-US'),
                      coverage:
                        profile.yearBuiltCoverage != null
                          ? `${Math.round(profile.yearBuiltCoverage * 100)}%`
                          : '—',
                      source: profile.source,
                    })}
                  </p>
                </>
              )}
            </div>
          </section>
          {/* Fixed specification of the file this section produces. These are
              constants of the USPS/printer contract, not checks that can fail,
              so they are printed as a ruled block rather than dressed as state. */}
          <dl className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['specs.suffix', 'specs.suffixVal', { code: campaign.code, households: coveredHouseholds }],
                ['specs.zipValidation', 'specs.zipValidationVal', {}],
                ['specs.carrierRoute', 'specs.carrierRouteVal', {}],
                ['specs.urls', 'specs.urlsVal', {}],
              ] as const
            ).map(([label, value, params]) => (
              <div key={label} className="bg-card px-4 py-3">
                <dt className="field-label">{t(`export:${label}`)}</dt>
                <dd className="field-value mt-1 text-[0.69rem] leading-snug text-ink">
                  {t(`export:${value}`, params)}
                </dd>
              </div>
            ))}
          </dl>

          {onDeliveredToPrinter && (
            <div className="border border-live/50 bg-background p-5">
              <p className="field-label text-live">{t('export:printer.label')}</p>
              <p className="mt-2 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
                {t('export:printer.body')}
              </p>
              <button
                id="btn-delivered-to-printer"
                type="button"
                onClick={onDeliveredToPrinter}
                disabled={isSaving || deliveredToPrinter || availableHouseholds === 0}
                className="imperative mt-4 border border-live bg-live px-4 py-2.5 text-[0.69rem] text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deliveredToPrinter ? t('export:printer.done') : t('export:printer.action')}
              </button>
              {availableHouseholds === 0 && !deliveredToPrinter && (
                <p className="mt-2 font-mono text-[0.69rem] text-muted-foreground">
                  {t('export:printer.needDownload')}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {showTelemetry && (
        <>
          {/* QR Codes & Tracking Studio */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* QR Selection List */}
            <div className="bg-card border border-border p-4 space-y-3 text-card-foreground ">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
                  <QrCode className="w-4 h-4 shrink-0 text-primary" />
                  <span>{t('export:qr.listTitle', { count: qrList.length })}</span>
                </h3>
                <span className="max-w-full text-[0.69rem] font-mono text-muted-foreground">
                  {t('export:qr.listSubtitle')}
                </span>
              </div>

              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {qrList.map((qr) => {
                  const isSelected = selectedQr?.slotNumber === qr.slotNumber;
                  const slot = slots.find((s) => s.slotNumber === qr.slotNumber);

                  return (
                    <div
                      key={qr.slotNumber}
                      onClick={() => setSelectedQr(qr)}
                      className={`p-2.5 border transition-colors cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-primary/10 border-primary text-foreground '
                          : 'bg-secondary/40 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {qr.destination ? (
                          <img
                            src={qr.qrDataUrl}
                            alt={t('export:qr.slotPrefix', { id: qr.displayNumber ?? qr.slotNumber })}
                            width={36}
                            height={36}
                            loading="lazy"
                            decoding="async"
                            className="w-9 h-9 shrink-0 bg-card p-0.5 border border-border"
                          />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-dashed border-border text-muted-foreground">
                            <QrCode className="h-4 w-4 opacity-40" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <span className="text-[0.63rem] font-mono font-bold text-primary block">
                            {t('export:qr.slotPrefix', { id: qr.displayNumber ?? qr.slotNumber })}
                          </span>
                          <h4 className="truncate text-xs font-bold text-foreground">
                            {qr.businessName}
                          </h4>
                          <span
                            className={`block truncate text-[0.63rem] font-mono ${qr.destination ? 'text-muted-foreground' : 'font-bold text-primary'}`}
                          >
                            {qr.destination ? (
                              <a
                                href={qr.destination}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="underline decoration-dotted hover:text-primary"
                              >
                                → {qr.destination}
                              </a>
                            ) : (
                              t('export:qr.pending')
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="ml-3 shrink-0 text-right">
                        <span className="text-xs font-mono font-bold text-clear">
                          {scansBySlot[qr.slotNumber] ?? 0}
                        </span>
                        <span className="text-[0.63rem] text-muted-foreground block">
                          {t('export:qr.scans')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected QR Preview & Live Scanner Simulator */}
            {selectedQr && (
              <div className="bg-card border border-border p-5 flex flex-col justify-between space-y-4 text-card-foreground ">
                <div>
                  <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
                    <span className="text-xs font-bold text-primary font-mono">
                      {t('export:qr.printHeader', { id: selectedQr.displayNumber ?? selectedQr.slotNumber })}
                    </span>
                    <span className="text-[0.69rem] text-muted-foreground font-mono">
                      {t('export:qr.vectorDpi')}
                    </span>
                  </div>

                  {(!selectedQr.destination || editingDest) ? (
                    <div className="space-y-3 border border-border bg-secondary/40 p-4">
                      <h3 className="text-sm font-bold text-foreground">{selectedQr.businessName}</h3>
                      <p className="text-xs leading-relaxed text-muted-foreground">{t('export:qr.pendingBody')}</p>
                      <label className="field-label block" htmlFor="qr-destination">
                        {t('export:qr.destinationLabel')}
                      </label>
                      <input
                        id="qr-destination"
                        type="url"
                        value={destDraft}
                        onChange={(e) => setDestDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveDestination()}
                        placeholder="https://www.negocio.com"
                        className="w-full border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleSaveDestination}
                          disabled={!destDraft.trim() || savingDest || !onSetDestination}
                          className="inline-flex items-center gap-1.5 bg-live px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          <span>{t('export:qr.generate')}</span>
                        </button>
                        {editingDest && (
                          <button
                            type="button"
                            onClick={() => {
                              setDestDraft(selectedQr.destination);
                              setEditingDest(false);
                            }}
                            className="border border-border bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-accent"
                          >
                            {t('export:qr.cancel')}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                  <div className="flex flex-col items-center justify-center p-4 bg-secondary/40 border border-border">
                    <img
                      src={selectedQr.qrDataUrl}
                      alt={t('export:qr.printHeader', { id: selectedQr.displayNumber ?? selectedQr.slotNumber })}
                      width={192}
                      height={192}
                      decoding="async"
                      className="w-48 h-48 bg-card p-2 border border-border"
                    />
                    <h3 className="text-sm font-bold text-foreground mt-3 text-center">
                      {selectedQr.businessName}
                    </h3>
                    <p className="text-[0.69rem] text-muted-foreground mt-1 font-mono text-center truncate max-w-full">
                      <a href={selectedQr.destination} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-primary">
                        → {selectedQr.destination}
                      </a>
                    </p>
                    <a
                      href={selectedQr.qrDataUrl}
                      download={`QR_Slot${selectedQr.displayNumber ?? selectedQr.slotNumber}_${(selectedQr.businessName || 'Slot').replace(/[^a-zA-Z0-9]/g, '_')}.png`}
                      className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-live text-primary-foreground text-xs font-bold transition-opacity hover:opacity-90 cursor-pointer shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar QR (PNG Imprenta)</span>
                    </a>
                    <p className="mt-3 max-w-full truncate text-center font-mono text-[0.69rem] text-foreground">
                      {t('export:qr.destination')}{' '}
                      <a href={selectedQr.destination} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-primary">
                        {selectedQr.destination}
                      </a>
                    </p>
                    {onSetDestination && (
                      <button
                        type="button"
                        onClick={() => setEditingDest(true)}
                        className="mt-1 text-[0.69rem] text-primary underline hover:opacity-80"
                      >
                        {t('export:qr.changeDestination')}
                      </button>
                    )}
                    <a
                      href={exportUrl(selectedQr.slotNumber)}
                      className="mt-3 inline-flex items-center gap-1.5 border border-live px-3 py-1.5 text-xs font-bold text-live hover:bg-live/10"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{t('export:telemetry.exportOne')}</span>
                    </a>
                  </div>
                  )}

                  {/* The redirect URL and its copy control. The button wraps
                      under the field rather than pushing out of the panel. */}
                  <p className="mt-3 text-[0.69rem] leading-snug text-muted-foreground">
                    {t('export:qr.trackingNote')}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      aria-label={t('export:qr.targetUrl')}
                      value={selectedQr.shortUrl}
                      className="min-w-0 flex-1 basis-48 border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none"
                    />
                    <button
                      onClick={() => handleCopyUrl(selectedQr.shortUrl)}
                      className="flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap border border-border bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-accent"
                    >
                      {copiedUrl === selectedQr.shortUrl ? (
                        <Check className="w-3.5 h-3.5 text-clear" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {copiedUrl === selectedQr.shortUrl
                          ? t('export:qr.copied')
                          : t('export:qr.copy')}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Test Simulator Button */}
                <div className="pt-3 border-t border-border">
                  <button
                    onClick={() => handleSimulateScan(selectedQr)}
                    className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs flex items-center justify-center space-x-2  transition-colors cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>{t('export:qr.simulateScan')}</span>
                  </button>
                  <p className="text-[0.63rem] text-muted-foreground text-center mt-1.5">
                    {t('export:qr.simulateDescription', { city: campaign.targetCity })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Live Analytics Scan Log */}
          <div className="grid grid-cols-1">
            <div className="bg-card border border-border p-4 space-y-3 text-card-foreground ">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center space-x-2">
                  <BarChart className="w-4 h-4 text-clear" />
                  <span>{t('export:telemetry.title')}</span>
                </h3>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="text-[0.69rem] text-muted-foreground font-mono">
                    {t('export:telemetry.summary', {
                      real: realScans.length,
                      unique: uniqueReal,
                      tests: scanEvents.length - realScans.length,
                    })}
                  </span>
                  {scanEvents.length > realScans.length && (
                    <button
                      type="button"
                      onClick={handleClearTests}
                      disabled={clearingTests}
                      className="border border-border bg-secondary px-2.5 py-1 text-[0.69rem] text-secondary-foreground hover:bg-accent disabled:opacity-40"
                    >
                      {t('export:telemetry.clearTests')}
                    </button>
                  )}
                  {scanEvents.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      disabled={clearingTests}
                      className="border border-due/50 px-2.5 py-1 text-[0.69rem] text-due hover:bg-due/10 disabled:opacity-40"
                    >
                      {t('export:telemetry.clearAll')}
                    </button>
                  )}
                  <a
                    href={exportUrl()}
                    className="inline-flex items-center gap-1.5 bg-live px-3 py-1 text-[0.69rem] font-bold text-primary-foreground hover:opacity-90"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{t('export:telemetry.exportAll')}</span>
                  </a>
                </div>
              </div>

              <div className="space-y-2 max-h-[460px] overflow-y-auto">
                {scanEvents.length === 0 ? (
                  <div className="text-center py-12 text-xs text-muted-foreground space-y-2">
                    <Smartphone className="w-6 h-6 mx-auto text-muted-foreground opacity-40" />
                    <p>{t('export:telemetry.noScans')}</p>
                    <p className="text-[0.63rem]">{t('export:telemetry.noScansSub')}</p>
                  </div>
                ) : (
                  scanEvents.map((evt) => {
                    const where = [evt.city, evt.region, evt.country].filter(Boolean).join(', ');
                    return (
                      <div
                        key={evt.id}
                        className={`border p-2.5 text-xs space-y-1 ${evt.is_test ? 'border-dashed border-border bg-background opacity-70' : 'border-border bg-secondary/40'}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-primary font-mono">
                            {t('export:telemetry.slotPrefix', {
                              id: slots.find((s) => s.slotNumber === evt.slot_number)?.displayNumber ?? evt.slot_number,
                              business: evt.business_name,
                            })}
                          </span>
                          <span className="flex items-center gap-1.5">
                            {evt.is_test && (
                              <span className="border border-border px-1 text-[0.6rem] font-bold uppercase text-muted-foreground">
                                {t('export:telemetry.test')}
                              </span>
                            )}
                            {repeatIds.has(evt.id) && (
                              <span className="border border-border px-1 text-[0.6rem] font-bold uppercase text-muted-foreground">
                                {t('export:telemetry.repeat')}
                              </span>
                            )}
                            <span className="text-[0.63rem] font-mono text-muted-foreground">
                              {evt.timestamp
                                ? new Date(evt.timestamp.endsWith('Z') || evt.timestamp.includes('+') ? evt.timestamp : `${evt.timestamp}Z`).toLocaleString(i18n.language)
                                : ''}
                            </span>
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-[0.69rem] text-muted-foreground font-mono sm:grid-cols-2">
                          <span>
                            {t('export:telemetry.device')} {describeDevice(evt.user_agent, evt.device_type)}
                          </span>
                          <span>
                            {t('export:telemetry.ip')} {maskIp(evt.client_ip)}
                          </span>
                          <span>
                            {t('export:telemetry.location')} {where || t('export:telemetry.locating')}
                          </span>
                          <span>
                            {t('export:telemetry.isp')} {evt.isp || '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
