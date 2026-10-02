import QRCode from 'qrcode';
import { SlotState } from '../types.ts';

export interface GeneratedQrData {
  slotNumber: number;
  displayNumber?: number;
  businessName: string;
  shortUrl: string;
  qrDataUrl: string;
}

export const TRACKING_BASE_URL =
  ((import.meta as any).env?.VITE_TRACKING_BASE_URL as string) ||
  (typeof window !== 'undefined' ? `${window.location.origin}/r` : 'http://localhost:8000/r');

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
    const slotId = `slot-${slot.slotNumber}`;
    const shortUrl = `${cleanBase}/${campaignId}/${slotId}`;

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
        qrDataUrl,
      });
    } catch (err) {
      console.error('Failed to generate QR for slot:', slot.slotNumber, err);
    }
  }

  return qrResults;
}
