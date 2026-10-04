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
  question: 'Question answering',
};

/**
 * The four agents as the user sees them. The gateway calls each one in turn and passes the
 * result on; agents never call each other (hub and spoke).
 */
export const AGENTS: Record<
  AnalysisStage,
  { name: string; short: string; role: string; input: string; output: string }
> = {
  risk_profile: {
    name: 'Risk Profiling Agent',
    short: 'Risk agent',
    role: 'Finds the business risks in your profile.',
    input: 'Your business profile',
    output: 'A list of risks, each with a reason',
  },
  policy_evidence: {
    name: 'Policy Intelligence Agent',
    short: 'Policy agent',
    role: 'Finds the policy wording that matches each risk.',
    input: 'The risks and your policy PDFs',
    output: 'Matching clauses with file, section and page',
  },
  coverage: {
    name: 'Coverage & Gap Analysis Agent',
    short: 'Coverage agent',
    role: 'Decides the coverage status of each risk.',
    input: 'The risks and their clauses',
    output: 'A status and potential-gap flag per risk',
  },
  report: {
    name: 'Explanation & Recommendation Agent',
    short: 'Explanation agent',
    role: 'Explains every finding in plain English.',
    input: 'The coverage decisions',
    output: 'A report with next steps and citations',
  },
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
