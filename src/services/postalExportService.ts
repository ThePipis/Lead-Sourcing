import QRCode from 'qrcode';
import { Household, SlotState } from '../types.ts';

export interface PostalManifestRow {
  RECORD_ID: number;
  ENDORSEMENT_LINE: string;
  PRIMARY_ADDRESS: string;
  CITY: string;
  STATE: string;
  ZIP_CODE: string;
  ZIP4: string;
  CARRIER_ROUTE: string;
  WALK_SEQUENCE: number;
  HOUSEHOLD_SCORE: number;
}

export const MANIFEST_HEADERS = [
  'RECORD_ID',
  'ENDORSEMENT_LINE',
  'PRIMARY_ADDRESS',
  'CITY',
  'STATE',
  'ZIP_CODE',
  'ZIP4',
  'CARRIER_ROUTE',
  'WALK_SEQUENCE',
  'HOUSEHOLD_SCORE',
] as const;

export interface GeneratedQrData {
  slotNumber: number;
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
        businessName: slot.businessName || `Slot ${slot.slotNumber}`,
        shortUrl,
        qrDataUrl,
      });
    } catch (err) {
      console.error('Failed to generate QR for slot:', slot.slotNumber, err);
    }
  }

  return qrResults;
}

/**
 * Normalizes 5,000 addresses according to Action Mail and Inland Valley Print & Mail specifications:
 * 1. Exact 10 certified columns
 * 2. ENDORSEMENT_LINE fixed with "RESIDENT OR CURRENT RESIDENT"
 * 3. RECORD_ID consecutive integer 1 to N
 * 4. Sorted ascending by 1º CARRIER_ROUTE (CRRT) and 2º WALK_SEQUENCE
 */
export function normalizeAndSortPostalManifest(households: Household[]): PostalManifestRow[] {
  // Sort strictly by Carrier Route ASC and Walk Sequence ASC
  const sorted = [...households].sort((a, b) => {
    if (a.carrierRoute !== b.carrierRoute) {
      return a.carrierRoute.localeCompare(b.carrierRoute);
    }
    return a.walkSequence - b.walkSequence;
  });

  return sorted.map((h, idx) => {
    let rawScore = h.compositeScore;
    if (rawScore > 0 && rawScore <= 1.0) {
      rawScore = rawScore * 100;
    }
    const scoreVal = Math.min(100, Math.max(1, Math.round(rawScore * 10) / 10));

    return {
      RECORD_ID: idx + 1,
      ENDORSEMENT_LINE: 'RESIDENT OR CURRENT RESIDENT',
      PRIMARY_ADDRESS: h.streetAddress.toUpperCase(),
      CITY: h.city.toUpperCase(),
      STATE: 'CA',
      ZIP_CODE: h.zip5,
      ZIP4: h.zip4,
      CARRIER_ROUTE: h.carrierRoute,
      WALK_SEQUENCE: h.walkSequence,
      HOUSEHOLD_SCORE: scoreVal,
    };
  });
}

/**
 * Generates CSV string with exact 10 columns for Action Mail / Inland Valley Print & Mail specification
 */
export function generateProductionManifestCsv(rows: PostalManifestRow[]): string {
  const lines = [MANIFEST_HEADERS.join(',')];

  for (const r of rows) {
    const values = [
      r.RECORD_ID,
      `"${r.ENDORSEMENT_LINE}"`,
      `"${r.PRIMARY_ADDRESS}"`,
      `"${r.CITY}"`,
      `"${r.STATE}"`,
      `"${r.ZIP_CODE}"`,
      `"${r.ZIP4}"`,
      `"${r.CARRIER_ROUTE}"`,
      r.WALK_SEQUENCE,
      r.HOUSEHOLD_SCORE,
    ];
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/**
 * Triggers file download in the browser
 */
export function downloadFile(filename: string, content: string, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Fetches the first 10 rows of the postal manifest from the backend API,
 * with resilient fallback to client-side households if unavailable.
 */
export async function fetchPostalManifestPreview(
  campaignId: string,
  fallbackHouseholds: Household[] = []
): Promise<PostalManifestRow[]> {
  try {
    const res = await fetch(`/api/export/${campaignId}/preview?limit=10`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.rows) && data.rows.length > 0) {
        return data.rows;
      }
    }
  } catch (err) {
    console.warn('[PostalExport] Backend preview failed, falling back to local dataset:', err);
  }

  if (fallbackHouseholds.length > 0) {
    const sorted = normalizeAndSortPostalManifest(fallbackHouseholds);
    return sorted.slice(0, 10);
  }

  return [];
}
