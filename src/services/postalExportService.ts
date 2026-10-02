import QRCode from 'qrcode';
import { SlotState } from '../types.ts';

export interface GeneratedQrData {
  slotNumber: number;
  displayNumber?: number;
  businessName: string;
  shortUrl: string;
  /** Where a scan lands after it is logged: the advertiser's website. Empty = still to set. */
  destination: string;
  qrDataUrl: string;
}

export const TRACKING_BASE_URL =
  ((import.meta as any).env?.VITE_TRACKING_BASE_URL as string) ||
  (typeof window !== 'undefined' ? `${window.location.origin}/r` : 'http://localhost:8000/r');

const isLocalHost = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

/**
 * The base every printed QR encodes. It has to be reachable from the phone that
 * scans it, so "localhost" is never used: a configured public base wins (the
 * production domain), else the page's own origin when it is not localhost, else
 * this PC's LAN address on the dev server's port (Vite proxies /r to the API).
 */
export async function resolveTrackingBase(): Promise<string> {
  const configured = TRACKING_BASE_URL;
  try {
    if (!isLocalHost(new URL(configured).hostname)) return configured;
  } catch {
    // not an absolute URL: fall through
  }
  if (typeof window === 'undefined') return configured;
  if (!isLocalHost(window.location.hostname)) return `${window.location.origin}/r`;
  try {
    const res = await fetch('/api/tracking/lan-ip');
    const { ip } = await res.json();
    if (ip) return `${window.location.protocol}//${ip}:${window.location.port || '80'}/r`;
  } catch {
    // no backend answer: keep the local base
  }
  return `${window.location.origin}/r`;
}

/**
 * Generates dynamic short URLs and QR Code images for the 14 slots
 * Pointing to: ${TRACKING_BASE_URL}/{campaign_id}/{slot_id}
 */
export async function generateCampaignQrCodes(
  campaignId: string,
  slots: SlotState[],
  trackingBaseUrl = TRACKING_BASE_URL
): Promise<GeneratedQrData[]> {
  const qrResults: GeneratedQrData[] = [];
  const cleanBase = (trackingBaseUrl || 'http://localhost:8000/r').replace(/\/+$/, '');

  for (const slot of slots) {
    if (slot.format === 'USPS' || slot.slotNumber === 32) continue;
    if (slot.notes?.startsWith('Covered by')) continue; // Skip covered/merged sub-slots
    // The short /q/<code> link when the slot has one; the old long form still
    // resolves, so cards already printed with it keep working.
    const shortUrl = slot.qrToken
      ? `${cleanBase.replace(/\/r$/, '')}/q/${slot.qrToken}`
      : `${cleanBase}/${campaignId}/slot-${slot.slotNumber}`;

    try {
      const qrDataUrl = await QRCode.toDataURL(shortUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
        color: {
          dark: '#111827',
          light: '#FFFFFF',
        },
      });

      qrResults.push({
        slotNumber: slot.slotNumber,
        displayNumber: slot.displayNumber,
        businessName: slot.businessName || `Slot ${slot.displayNumber ?? slot.slotNumber}`,
        shortUrl,
        destination: (slot.website || '').trim(),
        qrDataUrl,
      });
    } catch (err) {
      console.error('Failed to generate QR for slot:', slot.slotNumber, err);
    }
  }

  return qrResults;
}
