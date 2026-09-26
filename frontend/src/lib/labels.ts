// User-facing wording for API values, in one place (docs/frontend-plan.md §4).
import type { AnalysisStage, CoverageStatus, RiskCategory, Stage } from '../api/types';

export const STATUS_LABELS: Record<CoverageStatus, string> = {
  covered: 'Covered',
  conditional: 'Covered with conditions',
  unclear: 'Unclear – check the policy',
  excluded: 'Excluded',
  not_found: 'Not found in your policies',
};

/** Pipeline steps, in the words the user sees on the progress screen and in errors. */
export const STAGE_LABELS: Record<Stage, string> = {
  risk_profile: 'Risk profiling',
  policy_evidence: 'Policy evidence',
  coverage: 'Coverage analysis',
  report: 'Report writing',
  policy_upload: 'Policy upload',
};

export const AGENT_STAGES: readonly AnalysisStage[] = [
  'risk_profile',
  'policy_evidence',
  'coverage',
  'report',
];

export const CATEGORY_LABELS: Record<RiskCategory, string> = {
  property: 'Property',
  fire: 'Fire',
  equipment: 'Equipment',
  employee: 'Employees',
  business_interruption: 'Business interruption',
  liability: 'Liability',
  cyber: 'Cyber',
};

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

/** Confidence is shown as a word, never as a percentage (plan §4). */
export function confidenceLevel(value: number): ConfidenceLevel {
  if (value >= 0.75) return 'High';
  if (value >= 0.5) return 'Medium';
  return 'Low';
}
