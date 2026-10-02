import React from 'react';
import { useTranslation } from 'react-i18next';
import { RouteEngine } from './RouteEngine.tsx';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';

interface CurationStudioProps {
  /** Needed by the route engine, which stores its plan against the campaign. */
  campaignId: string;
  targetHouseholds: number;
  /** Reports the routes' covered household count up to the ledger and the card. */
  onCoverageChange: (covered: number, routeCount: number, missing: string[], replanned?: boolean) => void;
  targetZip: string;
  onGoToExport: () => void;
  /** Written down when the operator continues on a model that scored short. */
  onAcknowledgeModel?: () => void;
  modelAck?: string | null;
}

export const CurationStudio: React.FC<CurationStudioProps> = ({
  campaignId,
  targetZip,
  targetHouseholds,
  onCoverageChange,
  onGoToExport,
  onAcknowledgeModel,
  modelAck = null,
}) => {
  const { t } = useTranslation(['curation', 'common']);

  return (
    <div className="space-y-6">
      {/* The audience is decided here and only here: a saturation drop buys
          whole carrier routes, so the routes this panel selects are the drop. */}
      <RouteEngine
        campaignId={campaignId}
        targetZip={targetZip}
        targetHouseholds={targetHouseholds}
        onCoverageChange={onCoverageChange}
        onAcknowledgeModel={onAcknowledgeModel}
        modelAck={modelAck}
      />

      {/* What the scoring buys over an untargeted drop. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border p-4 space-y-2 text-card-foreground">
          <div className="flex items-center space-x-2 text-due font-bold text-xs">
            <AlertTriangle className="w-4 h-4" />
            <span>{t('curation:comparison.eddmTitle')}</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4 leading-relaxed">
            <li>{t('curation:comparison.eddm1')}</li>
            <li>{t('curation:comparison.eddm2')}</li>
            <li>{t('curation:comparison.eddm3')}</li>
          </ul>
        </div>

        <div className="bg-clear/10 border border-clear/40 p-4 space-y-2 text-card-foreground">
          <div className="flex items-center space-x-2 text-clear font-bold text-xs">
            <CheckCircle2 className="w-4 h-4" />
            <span>{t('curation:comparison.curationTitle')}</span>
          </div>
          <ul className="text-xs text-foreground space-y-1.5 list-disc pl-4 leading-relaxed">
            <li>{t('curation:comparison.curation1')}</li>
            <li>{t('curation:comparison.curation2')}</li>
            <li>{t('curation:comparison.curation3')}</li>
          </ul>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={onGoToExport}
          className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider bg-primary hover:bg-primary/90 text-primary-foreground flex items-center space-x-2 transition-colors cursor-pointer"
        >
          <span>{t('curation:comparison.continueExport')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
