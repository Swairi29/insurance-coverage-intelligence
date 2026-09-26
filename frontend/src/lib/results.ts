// Helpers for the results page (docs/frontend-plan.md §4).
import type {
  AnalysisResponse,
  CoverageAssessment,
  CoverageStatus,
  ExplanationMetadata,
} from '../api/types';
import { COVERAGE_STATUSES } from '../api/types';
import { plural } from './format';

/** Most serious first: the same order the report uses for priorities. */
export const STATUS_SEVERITY: Record<CoverageStatus, number> = {
  not_found: 0,
  excluded: 1,
  unclear: 2,
  conditional: 3,
  covered: 4,
};

export function sortBySeverity<T extends { status: CoverageStatus }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => STATUS_SEVERITY[a.status] - STATUS_SEVERITY[b.status]);
}

/** Findings per status, from the report when there is one, else from Agent 3. */
export function statusCounts(analysis: AnalysisResponse): Record<CoverageStatus, number> {
  const counts = Object.fromEntries(COVERAGE_STATUSES.map((s) => [s, 0])) as Record<
    CoverageStatus,
    number
  >;
  if (analysis.report) {
    for (const status of COVERAGE_STATUSES) {
      counts[status] = analysis.report.summary.counts_by_status[status] ?? 0;
    }
  } else {
    for (const assessment of analysis.coverage.assessments) counts[assessment.status]++;
  }
  return counts;
}

/** The report's headline, or one built from the coverage results for a partial analysis. */
export function headline(analysis: AnalysisResponse): string {
  if (analysis.report) return analysis.report.summary.headline;
  const assessments: CoverageAssessment[] = analysis.coverage.assessments;
  const gaps = assessments.filter((a) => a.potential_gap).length;
  return `${plural(assessments.length, 'risk')} checked, ${plural(gaps, 'potential gap')}.`;
}

/** Gateway, coverage and report warnings, without repeats (Agent 4 can repeat one per finding). */
export function analysisWarnings(analysis: AnalysisResponse): string[] {
  return [
    ...new Set([
      ...analysis.warnings,
      ...analysis.coverage.warnings,
      ...(analysis.report?.warnings ?? []),
    ]),
  ];
}

const PROVIDER_LABELS: Record<NonNullable<ExplanationMetadata['llm_provider']>, string> = {
  ollama: 'Ollama',
  gemini: 'Gemini',
};

/**
 * Which parts were written with an AI model, from each agent's metadata, e.g.
 * "AI used: qwen3:4b via Ollama (report: 12 of 14 findings)".
 */
export function aiUsage(analysis: AnalysisResponse): string {
  const parts: string[] = [];
  const risk = analysis.risk_profile.metadata;
  if (risk.llm_used) parts.push(`${risk.llm_model ?? 'an AI model'} (risk profile)`);
  const coverage = analysis.coverage.metadata;
  if (coverage.llm_used) parts.push(`${coverage.llm_model ?? 'an AI model'} (coverage)`);
  const report = analysis.report?.metadata;
  if (report?.llm_used && report.llm_findings > 0) {
    const via = report.llm_provider ? ` via ${PROVIDER_LABELS[report.llm_provider]}` : '';
    const total = report.llm_findings + report.template_findings;
    parts.push(
      `${report.llm_model ?? 'an AI model'}${via} (report: ${report.llm_findings} of ${plural(total, 'finding')})`,
    );
  }
  return parts.length > 0
    ? `AI used: ${parts.join(', ')}.`
    : 'No AI model was used; these results are rule-based and use standard wording.';
}
