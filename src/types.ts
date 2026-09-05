export type SlotStatus = 'VACANT' | 'PROSPECTING' | 'RESERVED' | 'PAID';

export type CardSide = 'FRONT' | 'BACK';

export interface CategoryDefinition {
  id: number;
  name: string;
  nicheEs: string;
  side: CardSide;
  slotType: 'HERO' | 'STANDARD_FRONT' | 'STANDARD_BACK' | 'MEDIUM_BACK' | 'USPS_AREA';
  widthInches: number;
  heightInches: number;
  priceUsd: number;
  avgTicketUsd: number;
  description: string;
  defaultHeadline: string;
  demographicWeights: {
    income: number;          // 0 to 1
    homeOwnership: number;   // 0 to 1
    homeAgeYears: number;    // 0 to 1 (importance of older homes needing maintenance)
    childrenPresent: number; // 0 to 1
    vehiclesCount: number;   // 0 to 1
    petOwner: number;        // 0 to 1
    homeValue: number;       // 0 to 1
  };
}

export interface SlotState {
  slotNumber: number;
  categoryId: number;
  businessName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  website?: string;
  status: SlotStatus;
  priceUsd: number;
  logoUrl?: string;
  offerHeadline?: string;
  qrCodeUrl?: string;
  qrRedirectUrl?: string;
  scanCount: number;
  paymentRef?: string;
  notes?: string;
}

export interface LeadProspect {
  id: string;
  categoryId: number;
  businessName: string;
  categoryName: string;
  address: string;
  city: string;
  zip: string;
  phone: string;
  rating: number;
  reviewCount: number;
  source: 'Yelp Fusion' | 'Geoapify Places' | 'Firecrawl Scraping';
  decisionMaker: string;
  decisionMakerTitle: string;
  avgTicketEstimated: number;
  bilingualHooks: {
    en: string;
    es: string;
  };
  roiPitch: string;
  status: 'NEW' | 'CONTACTED' | 'REJECTED' | 'WON';
  assignedSlot?: number;
}

export interface Household {
  id: string;
  residentName: string;
  streetAddress: string;
  city: string;
  state: 'CA';
  zip5: string;
  zip4: string;
  carrierRoute: string; // e.g., C001, C014, R002
  walkSequence: number;
  // Demographic vector attributes (normalized 0.0 - 1.0 or natural units)
  incomeScore: number;       // estimated household income scale
  homeOwnershipScore: number; // 1 = homeowner, 0 = renter
  homeAgeYears: number;      // years since build
  homeAgeScore: number;      // normalized home age need
  childrenPresentScore: number; // 1 = kids present, 0 = no kids
  vehiclesCount: number;     // 1 to 4+
  vehiclesScore: number;
  petOwnerScore: number;     // 1 = pets, 0 = no pets
  homeValueScore: number;    // relative home value
  // Calculated Propensity
  matchScores: Record<number, number>; // categoryId -> individual score
  compositeScore: number;    // sum of 14 matches
  selectedForDrop: boolean;
}

export interface Campaign {
  id: string;
  code: string; // e.g. "IE-EASTVALE-2026-Q1"
  name: string;
  targetCity: string;
  targetZip: string;
  radiusMiles: number;
  totalTargetHouseholds: number; // 5,000
  targetGrossRevenue: number;    // $7,264
  operatingCostEst: number;      // $3,000
  netMarginEst: number;          // $4,264
  status: 'PROSPECTING' | 'LOCKED_READY' | 'CURATING' | 'CURATED' | 'IN_PRODUCTION' | 'MAILED';
  slots: SlotState[];
  paidCount: number;
  totalCollectedUsd: number;
  curationCompletedAt?: string;
}

export interface CurationSummary {
  totalAnalyzed: number;
  totalSelected: number;
  minScore: number;
  maxScore: number;
  avgScore: number;
  carrierRouteDistribution: { route: string; count: number; zip: string }[];
  categorySynergyBreakdown: { categoryId: number; name: string; avgAffinity: number }[];
  scoreHistogram: { binRange: string; count: number }[];
}

export interface AnalyticsEvent {
  id: string;
  campaignId: string;
  slotNumber: number;
  businessName: string;
  timestamp: string;
  deviceType: 'Mobile' | 'Desktop' | 'Tablet';
  city: string;
  ipMock: string;
}
