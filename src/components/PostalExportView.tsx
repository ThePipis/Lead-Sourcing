import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  Smartphone,
  BarChart,
  Copy,
  Check,
  Eye,
  EyeOff,
  Table,
  QrCode,
} from 'lucide-react';
import { Campaign, SlotState, Household, AnalyticsEvent } from '../types.ts';
import {
  generateCampaignQrCodes,
  normalizeAndSortPostalManifest,
  generateProductionManifestCsv,
  downloadFile,
  fetchPostalManifestPreview,
  PostalManifestRow,
  GeneratedQrData,
  TRACKING_BASE_URL,
} from '../services/postalExportService.ts';

interface PostalExportViewProps {
  campaign: Campaign;
  slots: SlotState[];
  curatedHouseholds: Household[];
  onIncrementScan: (slotNumber: number) => void;
  /**
   * The manifest and the QR telemetry belong to different sections of the
   * form: section 4 cuts the CSV, section 5 reports what came back.
   */
  section?: 'manifest' | 'telemetry' | 'all';
  /** Section 4 closing stamp: the printer has the file. */
  onDeliveredToPrinter?: () => void;
  isSaving?: boolean;
  /**
   * Households already persisted for this campaign. The session array is empty
   * on a freshly opened campaign even when 5,000 rows exist in SQLite, so the
   * gate reads this rather than the in-memory list.
   */
  persistedCount?: number;
}

export const PostalExportView: React.FC<PostalExportViewProps> = ({
  campaign,
  slots,
  curatedHouseholds,
  onIncrementScan,
  section = 'all',
  onDeliveredToPrinter,
  isSaving = false,
  persistedCount = 0,
}) => {
  const { t, i18n } = useTranslation(['export', 'common']);
  const [qrList, setQrList] = useState<GeneratedQrData[]>([]);
  const [selectedQr, setSelectedQr] = useState<GeneratedQrData | null>(null);
  const [recentScanLog, setRecentScanLog] = useState<AnalyticsEvent[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [previewRows, setPreviewRows] = useState<PostalManifestRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);

  // Generate QR codes on mount or when slots change
  useEffect(() => {
    let isMounted = true;
    generateCampaignQrCodes(campaign.id, slots, TRACKING_BASE_URL).then((list) => {
      if (isMounted) {
        setQrList(list);
        setSelectedQr((prev) => prev ?? list[0] ?? null);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [campaign.id, slots]);

  const handleTogglePreview = async () => {
    if (!showPreview && previewRows.length === 0) {
      setPreviewLoading(true);
      setShowPreview(true);
      try {
        const rows = await fetchPostalManifestPreview(campaign.id, curatedHouseholds);
        setPreviewRows(rows);
      } catch (err) {
        console.error('Error cargando preview del manifiesto:', err);
      } finally {
        setPreviewLoading(false);
      }
    } else {
      setShowPreview(!showPreview);
    }
  };

  const handleDownloadCsv = async () => {
    setDownloading(true);
    try {
      // Intentar descarga directa del archivo certificado desde el backend
      const res = await fetch(`/api/export/${campaign.id}/manifest.csv`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `production_manifest_${campaign.id}_5000_ActionMail.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setDownloading(false);
        return;
      }
      console.warn(
        `[PostalExport] Backend manifest returned HTTP ${res.status}, using client generator`,
      );
    } catch (err) {
      console.warn('[PostalExport] Fallback a generador de cliente:', err);
    }

    if (curatedHouseholds.length === 0) {
      alert(t('export:alerts.needCuration'));
      setDownloading(false);
      return;
    }

    const normalizedRows = normalizeAndSortPostalManifest(curatedHouseholds);
    const csvContent = generateProductionManifestCsv(normalizedRows);
    const filename = `production_manifest_${campaign.code}_5000_ActionMail.csv`;
    downloadFile(filename, csvContent);
    setDownloading(false);
  };

  const handleSimulateScan = (qr: GeneratedQrData) => {
    onIncrementScan(qr.slotNumber);
    const newEvent: AnalyticsEvent = {
      id: `EVT-${Date.now()}`,
      campaignId: campaign.id,
      slotNumber: qr.slotNumber,
      businessName: qr.businessName,
      timestamp: new Date().toLocaleTimeString(i18n.language),
      deviceType: 'Mobile',
      city: campaign.targetCity,
      ipMock: `172.56.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    };
    setRecentScanLog((prev) => [newEvent, ...prev.slice(0, 7)]);
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const showManifest = section === 'manifest' || section === 'all';
  const showTelemetry = section === 'telemetry' || section === 'all';
  const deliveredToPrinter = campaign.status === 'IN_PRODUCTION' || campaign.status === 'MAILED';
  const availableHouseholds = Math.max(persistedCount, curatedHouseholds.length);

  return (
    <div className="space-y-6">
      {showManifest && (
        <>
          {/* Header Banner */}
          <div className="flex flex-col gap-4 border border-border bg-card p-5 text-card-foreground transition-colors lg:flex-row lg:items-center">
            <p className="min-w-0 sm:min-w-[34ch] max-w-[68ch] flex-1 text-xs leading-relaxed text-muted-foreground">
              {t('export:header.description')}
            </p>

            {/* Action Buttons: Preview + Download CSV */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                id="btn-preview-production-csv"
                type="button"
                onClick={handleTogglePreview}
                className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border transition-colors cursor-pointer flex items-center space-x-2  ${
                  showPreview
                    ? 'bg-primary text-primary-foreground border-primary '
                    : 'bg-secondary hover:bg-accent text-secondary-foreground border-border'
                }`}
              >
                {showPreview ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4 text-primary" />
                )}
                <span>
                  {showPreview ? t('export:header.hidePreview') : t('export:header.showPreview')}
                </span>
              </button>

              <button
                id="btn-download-production-csv"
                type="button"
                onClick={handleDownloadCsv}
                disabled={downloading}
                className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider bg-clear hover:opacity-90 disabled:opacity-50 text-background flex items-center justify-center gap-2 transition-opacity cursor-pointer text-center"
              >
                <Download className="w-4 h-4" />
                <span>
                  {downloading ? t('export:header.generating') : t('export:header.downloadCsv')}
                </span>
              </button>
            </div>
          </div>

          {/* Interactive Manifest Preview Section */}
          {showPreview && (
            <div className="bg-card border border-border p-5 space-y-4  text-card-foreground transition-colors">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Table className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                      {t('export:preview.title')}
                    </h3>
                    <span className="px-2 py-0.5 text-[0.63rem] font-mono bg-clear/15 text-clear border border-clear/40 font-bold">
                      {t('export:preview.badge')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {t('export:preview.subtitle', { id: campaign.id })}
                  </p>
                </div>

                <div className="flex items-center space-x-3 text-xs font-mono">
                  <span className="text-muted-foreground">
                    {t('export:preview.totalDataset')}{' '}
                    <strong className="text-foreground">{t('export:preview.households')}</strong>
                  </span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-primary font-bold">{t('export:preview.fixedColumns')}</span>
                </div>
              </div>

              {previewLoading ? (
                <div className="py-12 text-center text-muted-foreground space-y-2">
                  <div className="w-6 h-6 border border-primary border-t-transparent  animate-spin mx-auto"></div>
                  <p className="text-xs font-mono">{t('export:preview.loading')}</p>
                </div>
              ) : previewRows.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs">
                  {t('export:preview.noRecords')}
                </div>
              ) : (
                <div className="overflow-x-auto border border-border">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-secondary text-secondary-foreground border-b border-border">
                      <tr>
                        <th className="px-3 py-2.5 font-bold text-primary whitespace-nowrap">
                          # RECORD_ID
                        </th>
                        <th className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">
                          ENDORSEMENT_LINE
                        </th>
                        <th className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">
                          PRIMARY_ADDRESS
                        </th>
                        <th className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">
                          CITY
                        </th>
                        <th className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">
                          STATE
                        </th>
                        <th className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">
                          ZIP_CODE
                        </th>
                        <th className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">
                          ZIP4
                        </th>
                        <th className="px-3 py-2.5 font-bold text-ink whitespace-nowrap">
                          CARRIER_ROUTE
                        </th>
                        <th className="px-3 py-2.5 font-bold text-clear whitespace-nowrap">
                          WALK_SEQ
                        </th>
                        <th className="px-3 py-2.5 font-bold text-live whitespace-nowrap">SCORE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {previewRows.map((r) => (
                        <tr key={r.RECORD_ID} className="hover:bg-muted/50 transition-colors">
                          <td className="px-3 py-2 font-bold text-primary whitespace-nowrap">
                            {r.RECORD_ID}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            <span className="px-1.5 py-0.5 text-[0.63rem] bg-secondary text-secondary-foreground border border-border">
                              {r.ENDORSEMENT_LINE}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-foreground font-medium whitespace-nowrap">
                            {r.PRIMARY_ADDRESS}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {r.CITY}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {r.STATE}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {r.ZIP_CODE}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {r.ZIP4}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="px-2 py-0.5 text-[0.69rem] font-bold bg-secondary text-ink border border-rule-strong">
                              {r.CARRIER_ROUTE}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-bold text-clear whitespace-nowrap">
                            {r.WALK_SEQUENCE}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="px-1.5 py-0.5 text-[0.63rem] font-bold bg-live/15 text-live border border-live/40">
                              {r.HOUSEHOLD_SCORE}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Fixed specification of the file this section produces. These are
              constants of the USPS/printer contract, not checks that can fail,
              so they are printed as a ruled block rather than dressed as state. */}
          <dl className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['specs.suffix', 'specs.suffixVal'],
                ['specs.zipValidation', 'specs.zipValidationVal'],
                ['specs.carrierRoute', 'specs.carrierRouteVal'],
                ['specs.urls', 'specs.urlsVal'],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="bg-card px-4 py-3">
                <dt className="field-label">{t(`export:${label}`)}</dt>
                <dd className="field-value mt-1 text-[0.69rem] leading-snug text-ink">
                  {t(`export:${value}`)}
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
                  <span>{t('export:qr.listTitle')}</span>
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
                        <img
                          src={qr.qrDataUrl}
                          alt={t('export:qr.slotPrefix', { id: qr.slotNumber })}
                          width={36}
                          height={36}
                          loading="lazy"
                          decoding="async"
                          className="w-9 h-9 shrink-0 bg-card p-0.5 border border-border"
                        />
                        <div className="min-w-0">
                          <span className="text-[0.63rem] font-mono font-bold text-primary block">
                            {t('export:qr.slotPrefix', { id: qr.slotNumber })}
                          </span>
                          <h4 className="truncate text-xs font-bold text-foreground">
                            {qr.businessName}
                          </h4>
                        </div>
                      </div>

                      <div className="ml-3 shrink-0 text-right">
                        <span className="text-xs font-mono font-bold text-clear">
                          {slot?.scanCount || 0}
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
                      {t('export:qr.printHeader', { id: selectedQr.slotNumber })}
                    </span>
                    <span className="text-[0.69rem] text-muted-foreground font-mono">
                      {t('export:qr.vectorDpi')}
                    </span>
                  </div>

                  <div className="flex flex-col items-center justify-center p-4 bg-secondary/40 border border-border">
                    <img
                      src={selectedQr.qrDataUrl}
                      alt={t('export:qr.printHeader', { id: selectedQr.slotNumber })}
                      width={192}
                      height={192}
                      decoding="async"
                      className="w-48 h-48 bg-card p-2 border border-border"
                    />
                    <h3 className="text-sm font-bold text-foreground mt-3 text-center">
                      {selectedQr.businessName}
                    </h3>
                    <p className="text-[0.69rem] text-muted-foreground mt-1 font-mono text-center truncate max-w-full">
                      {selectedQr.shortUrl}
                    </p>
                    <a
                      href={selectedQr.qrDataUrl}
                      download={`QR_${selectedQr.slotNumber}_${(selectedQr.businessName || 'Slot').replace(/[^a-zA-Z0-9]/g, '_')}.png`}
                      className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-live text-primary-foreground text-xs font-bold transition-opacity hover:opacity-90 cursor-pointer shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar QR (PNG Imprenta)</span>
                    </a>
                  </div>

                  {/* The redirect URL and its copy control. The button wraps
                      under the field rather than pushing out of the panel. */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
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
                <span className="text-[0.69rem] text-muted-foreground font-mono">
                  {t('export:telemetry.totalScans', {
                    count: slots.reduce((acc, s) => acc + s.scanCount, 0),
                  })}
                </span>
              </div>

              <div className="space-y-2 max-h-[460px] overflow-y-auto">
                {recentScanLog.length === 0 ? (
                  <div className="text-center py-12 text-xs text-muted-foreground space-y-2">
                    <Smartphone className="w-6 h-6 mx-auto text-muted-foreground opacity-40" />
                    <p>{t('export:telemetry.noScans')}</p>
                    <p className="text-[0.63rem]">{t('export:telemetry.noScansSub')}</p>
                  </div>
                ) : (
                  recentScanLog.map((evt) => (
                    <div
                      key={evt.id}
                      className="bg-secondary/40 p-2.5 border border-border text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-primary font-mono">
                          {t('export:telemetry.slotPrefix', {
                            id: evt.slotNumber,
                            business: evt.businessName,
                          })}
                        </span>
                        <span className="text-[0.63rem] font-mono text-muted-foreground">
                          {evt.timestamp}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[0.69rem] text-muted-foreground font-mono">
                        <span>
                          {t('export:telemetry.device')} {evt.deviceType}
                        </span>
                        <span>
                          {t('export:telemetry.ip')} {evt.ipMock}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
