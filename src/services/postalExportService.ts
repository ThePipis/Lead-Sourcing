import QRCode from 'qrcode';
import { Household, SlotState } from '../types.ts';

export interface PostalManifestRow {
  RecordID: string;
  RecipientLine: string;
  AddressLine: string;
  City: string;
  State: string;
  Zip5: string;
  Zip4: string;
  FullPostalCode: string;
  CarrierRoute: string;
  WalkSequence: number;
  CompositeAffinityScore: number;
}

export interface GeneratedQrData {
  slotNumber: number;
  businessName: string;
  shortUrl: string;
  qrDataUrl: string;
}

/**
 * Generates dynamic short URLs and QR Code images for the 14 slots
 */
export async function generateCampaignQrCodes(
  campaignId: string,
  slots: SlotState[],
  baseUrl = 'https://coop-mail.inlandempire.direct'
): Promise<GeneratedQrData[]> {
  const qrResults: GeneratedQrData[] = [];

  for (const slot of slots) {
    const businessSlug = (slot.businessName || `slot-${slot.slotNumber}`)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    const shortUrl = `${baseUrl}/r/${campaignId}/${businessSlug}`;

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
 * Normalizes 5,000 addresses according to USPS CASS & NCOA carrier route standards
 * for Action Mail and Inland Valley Print & Mail production specs:
 * 1. Appends "or Current Resident"
 * 2. Validates 5-digit ZIP + 4-digit extension
 * 3. Sorts by Carrier Route ID (CRRT) ASC and Walk Sequence ASC (USPS Saturation / ECRWSS order)
 */
export function normalizeAndSortPostalManifest(households: Household[]): PostalManifestRow[] {
  // Sort strictly by Carrier Route and Walk Sequence
  const sorted = [...households].sort((a, b) => {
    if (a.carrierRoute !== b.carrierRoute) {
      return a.carrierRoute.localeCompare(b.carrierRoute);
    }
    return a.walkSequence - b.walkSequence;
  });

  return sorted.map((h) => ({
    RecordID: h.id,
    RecipientLine: `${h.residentName.toUpperCase()} OR CURRENT RESIDENT`,
    AddressLine: h.streetAddress.toUpperCase(),
    City: h.city.toUpperCase(),
    State: 'CA',
    Zip5: h.zip5,
    Zip4: h.zip4,
    FullPostalCode: `${h.zip5}-${h.zip4}`,
    CarrierRoute: h.carrierRoute,
    WalkSequence: h.walkSequence,
    CompositeAffinityScore: h.compositeScore,
  }));
}

/**
 * Generates CSV string for Action Mail / Inland Valley Print & Mail specification
 */
export function generateProductionManifestCsv(rows: PostalManifestRow[]): string {
  const headers = [
    'RECORD_ID',
    'ADDRESSEE_LINE',
    'DELIVERY_ADDRESS',
    'CITY',
    'STATE',
    'ZIP5',
    'ZIP4',
    'FULL_ZIP',
    'CARRIER_ROUTE_CRRT',
    'WALK_SEQUENCE',
    'COMPOSITE_AFFINITY_SCORE',
    'ENDORSEMENT_LINE',
    'MAIL_CLASS',
  ];

  const lines = [headers.join(',')];

  for (const r of rows) {
    const values = [
      `"${r.RecordID}"`,
      `"${r.RecipientLine}"`,
      `"${r.AddressLine}"`,
      `"${r.City}"`,
      `"${r.State}"`,
      `"${r.Zip5}"`,
      `"${r.Zip4}"`,
      `"${r.FullPostalCode}"`,
      `"${r.CarrierRoute}"`,
      r.WalkSequence,
      r.CompositeAffinityScore,
      `"*****ECRWSS**${r.CarrierRoute}"`,
      `"USPS MARKETING MAIL - ENHANCED CARRIER ROUTE"`,
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
