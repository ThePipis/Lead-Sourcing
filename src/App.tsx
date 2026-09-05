import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { FinancialMetrics } from './components/FinancialMetrics.tsx';
import { PostalCanvas } from './components/PostalCanvas.tsx';
import { ProspectingView } from './components/ProspectingView.tsx';
import { CurationStudio } from './components/CurationStudio.tsx';
import { PostalExportView } from './components/PostalExportView.tsx';
import { ArchitectureViewer } from './components/ArchitectureViewer.tsx';
import { CLOSED_CATEGORIES, DEFAULT_CAMPAIGN_PARAMS } from './data/categories.ts';
import { Campaign, SlotState, SlotStatus, LeadProspect, Household, CurationSummary } from './types.ts';
import { generateSyntheticHouseholds, executePropensityCuration } from './services/propensityEngine.ts';

export default function App() {
  const [currentTab, setCurrentTab] = useState<
    'canvas' | 'prospecting' | 'curation' | 'export' | 'architecture'
  >('canvas');

  // Initialize slots with 14 closed niches
  const initialSlots: SlotState[] = CLOSED_CATEGORIES.map((cat, idx) => {
    // Give 5 initial slots realistic starting statuses to show operational workflow
    const initialStatus: SlotStatus = 
      idx === 0 ? 'PAID' :        // Hero Dental
      idx === 1 ? 'PAID' :        // HVAC
      idx === 2 ? 'PAID' :        // Vet
      idx === 7 ? 'RESERVED' :    // Roofing
      idx === 12 ? 'PROSPECTING' :// Mexican Restaurant
      'VACANT';

    const defaultNames: Record<number, string> = {
      1: 'Eastvale Premier Family Dentistry',
      2: 'Inland Air Pro Heating & Cooling',
      3: 'Eastvale Animal Hospital & Urgent Pet Care',
      8: 'Inland Solar & Roofing Dynamics',
      13: 'Taquería El Tapatío & Cantina Familiar',
    };

    return {
      slotNumber: cat.id,
      categoryId: cat.id,
      businessName: defaultNames[cat.id] || '',
      status: initialStatus,
      priceUsd: cat.priceUsd,
      offerHeadline: cat.defaultHeadline,
      scanCount: idx === 0 ? 12 : idx === 1 ? 8 : 0,
    };
  });

  const [campaign, setCampaign] = useState<Campaign>({
    id: 'camp_ie_eastvale_2026_q1',
    code: 'IE-EASTVALE-92880-Q1',
    name: 'Co-Op Direct Mail - Eastvale Spring Run',
    targetCity: 'Eastvale',
    targetZip: '92880',
    radiusMiles: 5.0,
    totalTargetHouseholds: DEFAULT_CAMPAIGN_PARAMS.targetHouseholds,
    targetGrossRevenue: DEFAULT_CAMPAIGN_PARAMS.grossTargetRevenue,
    operatingCostEst: DEFAULT_CAMPAIGN_PARAMS.operatingCostEst,
    netMarginEst: DEFAULT_CAMPAIGN_PARAMS.netMarginEst,
    status: 'PROSPECTING',
    slots: initialSlots,
    paidCount: 3,
    totalCollectedUsd: 850 + 497 + 497, // Hero + 2 standard
  });

  // Audience Curation State
  const [curatedHouseholds, setCuratedHouseholds] = useState<Household[]>([]);
  const [curationSummary, setCurationSummary] = useState<CurationSummary | null>(null);
  const [isCurating, setIsCurating] = useState<boolean>(false);

  // Auto-recalculate financial metrics when slots change
  useEffect(() => {
    const paidSlots = campaign.slots.filter((s) => s.status === 'PAID');
    const totalCollected = paidSlots.reduce((acc, s) => acc + s.priceUsd, 0);
    const paidCount = paidSlots.length;

    setCampaign((prev) => ({
      ...prev,
      paidCount,
      totalCollectedUsd: totalCollected,
      status:
        prev.status === 'CURATED'
          ? 'CURATED'
          : paidCount === 14
          ? 'LOCKED_READY'
          : 'PROSPECTING',
    }));
  }, [campaign.slots]);

  // Handle Microzone change
  const handleZoneChange = (city: string, zip: string) => {
    setCampaign((prev) => ({
      ...prev,
      targetCity: city,
      targetZip: zip,
      code: `IE-${city.slice(0, 4).toUpperCase()}-${zip}`,
      name: `Co-Op Direct Mail - ${city} Spring Run`,
    }));
  };

  // Update a slot status
  const handleUpdateSlotStatus = (slotNumber: number, newStatus: SlotStatus) => {
    setCampaign((prev) => ({
      ...prev,
      slots: prev.slots.map((s) =>
        s.slotNumber === slotNumber ? { ...s, status: newStatus } : s
      ),
    }));
  };

  // Update a slot business name and headline
  const handleUpdateSlotBusiness = (slotNumber: number, businessName: string, headline?: string) => {
    setCampaign((prev) => ({
      ...prev,
      slots: prev.slots.map((s) =>
        s.slotNumber === slotNumber
          ? {
              ...s,
              businessName,
              offerHeadline: headline || s.offerHeadline,
              status: s.status === 'VACANT' ? 'RESERVED' : s.status,
            }
          : s
      ),
    }));
  };

  // Assign lead from CRM Prospecting to slot
  const handleAssignLeadToSlot = (slotNumber: number, lead: LeadProspect) => {
    setCampaign((prev) => ({
      ...prev,
      slots: prev.slots.map((s) =>
        s.slotNumber === slotNumber
          ? {
              ...s,
              businessName: lead.businessName,
              contactPerson: lead.decisionMaker,
              phone: lead.phone,
              status: 'RESERVED',
              offerHeadline: lead.bilingualHooks.es,
            }
          : s
      ),
    }));
    setCurrentTab('canvas');
  };

  // Autocomplete all slots to PAID for demo/evaluation
  const handleQuickSimulateAllPaid = () => {
    const demoNames: Record<number, string> = {
      1: 'Eastvale Premier Family Dentistry',
      2: 'Inland Air Pro Heating & Cooling',
      3: 'Eastvale Animal Hospital & Urgent Pet Care',
      4: 'Riverside County Master Plumbing',
      5: 'Eastvale Auto Care & Brake Masters',
      6: "Vito's Stone Oven Artisanal Pizza",
      7: 'Apex Athletic Performance & CrossFit',
      8: 'Inland Solar & Roofing Dynamics',
      9: 'Eastvale Spine & Wellness Center',
      10: 'Inland Empire Steam Pro Carpet & Tile',
      11: 'Signature Mobile Detailing & Ceramic',
      12: 'Fluffy Paws Mobile Spa & Grooming',
      13: 'Taquería El Tapatío & Cantina Familiar',
      14: 'Inland Valley Insurance Advisors',
    };

    setCampaign((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => ({
        ...s,
        status: 'PAID',
        businessName: s.businessName || demoNames[s.slotNumber] || `Comercio Slot ${s.slotNumber}`,
      })),
    }));
  };

  // Run Algorithmic Propensity Curation
  const handleRunCuration = () => {
    setIsCurating(true);
    setTimeout(() => {
      // 1. Generate 15,000 synthetic households from Inland Empire
      const pool = generateSyntheticHouseholds(campaign.targetCity, campaign.targetZip, 15000);
      // 2. Vectorized dot-product scoring and top 5,000 cutoff
      const { curatedHouseholds: top5k, summary } = executePropensityCuration(
        pool,
        CLOSED_CATEGORIES,
        5000
      );

      setCuratedHouseholds(top5k);
      setCurationSummary(summary);
      setIsCurating(false);
      setCampaign((prev) => ({ ...prev, status: 'CURATED' }));
    }, 600);
  };

  // Trigger Curation from Master Button
  const handleTriggerCurationMaster = () => {
    setCurrentTab('curation');
    if (curatedHouseholds.length === 0) {
      handleRunCuration();
    }
  };

  // Increment scan count when simulated in export view
  const handleIncrementScan = (slotNumber: number) => {
    setCampaign((prev) => ({
      ...prev,
      slots: prev.slots.map((s) =>
        s.slotNumber === slotNumber ? { ...s, scanCount: s.scanCount + 1 } : s
      ),
    }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950">
      {/* Platform Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        campaign={campaign}
        onZoneChange={handleZoneChange}
      />

      {/* Main Content View */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Executive Financial Metrics & Cash Rule Bar */}
        <FinancialMetrics
          campaign={campaign}
          onExecuteCuration={handleTriggerCurationMaster}
        />

        {/* Tab 1: Interactive 12x9" Canvas */}
        {currentTab === 'canvas' && (
          <PostalCanvas
            slots={campaign.slots}
            onUpdateSlotStatus={handleUpdateSlotStatus}
            onUpdateSlotBusiness={handleUpdateSlotBusiness}
            onQuickSimulateAllPaid={handleQuickSimulateAllPaid}
            onExecuteCuration={handleTriggerCurationMaster}
          />
        )}

        {/* Tab 2: Lead Sourcing CRM & Yelp/LLM Hit List */}
        {currentTab === 'prospecting' && (
          <ProspectingView
            targetCity={campaign.targetCity}
            targetZip={campaign.targetZip}
            slots={campaign.slots}
            onAssignLeadToSlot={handleAssignLeadToSlot}
          />
        )}

        {/* Tab 3: Algorithmic Propensity Curation Engine */}
        {currentTab === 'curation' && (
          <CurationStudio
            campaignCode={campaign.code}
            targetCity={campaign.targetCity}
            targetZip={campaign.targetZip}
            curatedHouseholds={curatedHouseholds}
            curationSummary={curationSummary}
            isCurating={isCurating}
            onRunCuration={handleRunCuration}
            onGoToExport={() => setCurrentTab('export')}
          />
        )}

        {/* Tab 4: QR Generator & Action Mail Postal Manifest */}
        {currentTab === 'export' && (
          <PostalExportView
            campaign={campaign}
            slots={campaign.slots}
            curatedHouseholds={curatedHouseholds}
            onIncrementScan={handleIncrementScan}
          />
        )}

        {/* Tab 5: FastAPI & Architecture Specification */}
        {currentTab === 'architecture' && <ArchitectureViewer />}
      </main>

      {/* Enterprise Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 mt-12 py-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Co-Op Direct Mail Platform • Inland Empire Shared Direct Mail Operations
          </span>
          <span className="font-mono text-slate-400">
            USPS Marketing Mail ECRWSS • CASS/NCOA Certified • Action Mail Spec
          </span>
        </div>
      </footer>
    </div>
  );
}
