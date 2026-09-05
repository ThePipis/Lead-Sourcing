import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  QrCode, 
  Download, 
  CheckCircle2, 
  ExternalLink, 
  Smartphone, 
  BarChart, 
  ShieldCheck, 
  ArrowRight,
  Printer,
  Copy,
  Check
} from 'lucide-react';
import { Campaign, SlotState, Household, AnalyticsEvent } from '../types.ts';
import { 
  generateCampaignQrCodes, 
  normalizeAndSortPostalManifest, 
  generateProductionManifestCsv, 
  downloadFile,
  GeneratedQrData 
} from '../services/postalExportService.ts';

interface PostalExportViewProps {
  campaign: Campaign;
  slots: SlotState[];
  curatedHouseholds: Household[];
  onIncrementScan: (slotNumber: number) => void;
}

export const PostalExportView: React.FC<PostalExportViewProps> = ({
  campaign,
  slots,
  curatedHouseholds,
  onIncrementScan,
}) => {
  const [qrList, setQrList] = useState<GeneratedQrData[]>([]);
  const [selectedQr, setSelectedQr] = useState<GeneratedQrData | null>(null);
  const [recentScanLog, setRecentScanLog] = useState<AnalyticsEvent[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Generate QR codes on mount or when slots change
  useEffect(() => {
    let isMounted = true;
    generateCampaignQrCodes(campaign.id, slots).then((list) => {
      if (isMounted) {
        setQrList(list);
        if (list.length > 0 && !selectedQr) {
          setSelectedQr(list[0]);
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, [campaign.id, slots]);

  const handleDownloadCsv = () => {
    if (curatedHouseholds.length === 0) {
      alert('Primero ejecute la curación en el Módulo C para generar los 5,000 hogares.');
      return;
    }

    const normalizedRows = normalizeAndSortPostalManifest(curatedHouseholds);
    const csvContent = generateProductionManifestCsv(normalizedRows);
    const filename = `production_manifest_${campaign.code}_5000_ActionMail.csv`;
    downloadFile(filename, csvContent);
  };

  const handleSimulateScan = (qr: GeneratedQrData) => {
    onIncrementScan(qr.slotNumber);
    const newEvent: AnalyticsEvent = {
      id: `EVT-${Date.now()}`,
      campaignId: campaign.id,
      slotNumber: qr.slotNumber,
      businessName: qr.businessName,
      timestamp: new Date().toLocaleTimeString(),
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

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs text-amber-400 font-mono mb-1 font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>MÓDULO D • EXPORTACIÓN TURNKEY & RASTREO DINÁMICO</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Generador de Códigos QR & Manifiesto Postal de Imprenta
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Cumplimiento técnico certificado para <strong>Action Mail</strong> e <strong>Inland Valley Print & Mail</strong>. 
            Normalización automática CASS/NCOA, sufijo obligatorio "or Current Resident" y ordenación por Carrier Route (CRRT).
          </p>
        </div>

        {/* Download CSV Action Button */}
        <button
          id="btn-download-production-csv"
          onClick={handleDownloadCsv}
          className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>Descargar Manifiesto CSV (5,000)</span>
        </button>
      </div>

      {/* Production Specs Validation Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-700 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-white block">Sufijo USPS Añadido</span>
            <span className="text-slate-400 font-mono text-[11px]">"OR CURRENT RESIDENT"</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-700 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-white block">ZIP+4 & CASS Validado</span>
            <span className="text-slate-400 font-mono text-[11px]">5 dígitos + 4 extensión</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-700 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-white block">Orden Carrier Route (CRRT)</span>
            <span className="text-slate-400 font-mono text-[11px]">Walk Sequence Ordenado</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-700 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-white block">14 URLs Cortas Dinámicas</span>
            <span className="text-slate-400 font-mono text-[11px]">/r/&#123;campaign&#125;/&#123;slug&#125;</span>
          </div>
        </div>
      </div>

      {/* QR Codes & Tracking Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* QR Selection List */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <QrCode className="w-4 h-4 text-amber-400" />
              <span>14 Códigos QR de Rastreo</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">1 por negocio</span>
          </div>

          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {qrList.map((qr) => {
              const isSelected = selectedQr?.slotNumber === qr.slotNumber;
              const slot = slots.find((s) => s.slotNumber === qr.slotNumber);

              return (
                <div
                  key={qr.slotNumber}
                  onClick={() => setSelectedQr(qr)}
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <img
                      src={qr.qrDataUrl}
                      alt={`QR Slot ${qr.slotNumber}`}
                      className="w-9 h-9 rounded bg-white p-0.5"
                    />
                    <div>
                      <span className="text-[10px] font-mono font-bold text-amber-400 block">
                        SLOT #{qr.slotNumber}
                      </span>
                      <h4 className="text-xs font-bold truncate max-w-[170px]">
                        {qr.businessName}
                      </h4>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {slot?.scanCount || 0}
                    </span>
                    <span className="text-[10px] text-slate-500 block">escaneos</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected QR Preview & Live Scanner Simulator */}
        {selectedQr && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <span className="text-xs font-bold text-amber-400 font-mono">
                  SLOT #{selectedQr.slotNumber} • CÓDIGO QR PARA IMPRESIÓN
                </span>
                <span className="text-[11px] text-slate-400 font-mono">300 DPI Vectorial</span>
              </div>

              <div className="flex flex-col items-center justify-center p-4 bg-slate-950 rounded-xl border border-slate-800">
                <img
                  src={selectedQr.qrDataUrl}
                  alt={`QR ${selectedQr.businessName}`}
                  className="w-48 h-48 rounded-lg bg-white p-2 shadow-xl"
                />
                <h3 className="text-sm font-bold text-white mt-3 text-center">
                  {selectedQr.businessName}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 font-mono text-center truncate max-w-full">
                  {selectedQr.shortUrl}
                </p>
              </div>

              {/* URL & Action buttons */}
              <div className="mt-3 flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={selectedQr.shortUrl}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300 font-mono focus:outline-none"
                />
                <button
                  onClick={() => handleCopyUrl(selectedQr.shortUrl)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded text-xs flex items-center space-x-1"
                >
                  {copiedUrl === selectedQr.shortUrl ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Copiar</span>
                </button>
              </div>
            </div>

            {/* Test Simulator Button */}
            <div className="pt-3 border-t border-slate-800">
              <button
                onClick={() => handleSimulateScan(selectedQr)}
                className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 shadow-md transition-all cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                <span>Simular Escaneo Móvil de Cliente (+1)</span>
              </button>
              <p className="text-[10px] text-slate-500 text-center mt-1.5">
                Simula a un vecino de Eastvale escaneando el código físico en su buzón.
              </p>
            </div>
          </div>
        )}

        {/* Live Analytics Scan Log */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <BarChart className="w-4 h-4 text-emerald-400" />
              <span>Registro de Escaneos en Tiempo Real</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              Total: {slots.reduce((acc, s) => acc + s.scanCount, 0)} scans
            </span>
          </div>

          <div className="space-y-2 max-h-[460px] overflow-y-auto">
            {recentScanLog.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500 space-y-2">
                <Smartphone className="w-6 h-6 mx-auto text-slate-600 opacity-60" />
                <p>No hay escaneos registrados aún.</p>
                <p className="text-[10px]">Presione "Simular Escaneo Móvil" para probar la telemetría.</p>
              </div>
            ) : (
              recentScanLog.map((evt) => (
                <div key={evt.id} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-400 font-mono">
                      Slot #{evt.slotNumber} • {evt.businessName}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">{evt.timestamp}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>Dispositivo: {evt.deviceType}</span>
                    <span>IP: {evt.ipMock}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
