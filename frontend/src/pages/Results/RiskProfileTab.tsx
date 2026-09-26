import type { IdentifiedRisk, RiskProfileResponse } from '../../api/types';
import { RISK_CATEGORIES } from '../../api/types';
import { AiLabel } from '../../components/AiLabel';
import { ConfidenceLabel } from '../../components/ConfidenceLabel';
import { Alert } from '../../components/ui/Alert';
import { CATEGORY_LABELS } from '../../lib/labels';

/** Agent 1's view of the business: which risks it found, why, and how sure it is. */
export function RiskProfileTab({ profile }: { profile: RiskProfileResponse }) {
  const model = profile.metadata.llm_model;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        {profile.risks.length} business risks were identified from your profile. Each one was then
        checked against your policies.
      </p>

      {profile.warnings.length > 0 && (
        <Alert tone="info" title="About this risk profile">
          <ul className="list-disc pl-5">
            {profile.warnings.map((warning) => (
              <li key={`${warning.code}-${warning.field ?? ''}-${warning.message}`}>
                {warning.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {RISK_CATEGORIES.map((category) => {
        const risks = profile.risks.filter((r) => r.category === category);
        if (risks.length === 0) return null;
        return (
          <section key={category} aria-labelledby={`category-${category}`}>
            <h2 id={`category-${category}`} className="text-lg font-bold">
              {CATEGORY_LABELS[category]}{' '}
              <span className="font-normal text-muted">({risks.length})</span>
            </h2>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {risks.map((risk) => (
                <RiskCard key={risk.risk_id} risk={risk} model={model} />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="text-xs text-muted">
        Risk taxonomy version {profile.metadata.taxonomy_version}
      </p>
    </div>
  );
}

function RiskCard({ risk, model }: { risk: IdentifiedRisk; model: string | null }) {
  return (
    <li className="rounded-card border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold">{risk.name}</h3>
        <AiLabel kind="risk" value={risk.source} model={model} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink">{risk.reason}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ConfidenceLabel value={risk.confidence} />
        {risk.evidence.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Based on">
            {risk.evidence.map((e) => (
              <li
                key={`${e.field}-${e.value}`}
                className="rounded-md bg-brand-soft px-2 py-0.5 text-xs text-muted-strong"
              >
                {e.field.replace(/_/g, ' ')}: <span className="text-ink-heading">{e.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
