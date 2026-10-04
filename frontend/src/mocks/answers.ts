// Mock answers to questions about an analysis. Like the backend's rule-based answer
// (agents/explanation_agent/qa_answer.py): matching risks with the plain meaning of their
// status and their best clause, a glossary definition, or "this analysis does not answer it".

import type {
  AnalysisResponse,
  CoverageAssessment,
  CoverageStatus,
  EvidenceCitation,
  QuestionAnswerResponse,
} from '../api/types';
import { newId } from './db';

const PLAIN_MEANING: Record<CoverageStatus, string> = {
  not_found: 'No policy wording about this risk was found.',
  excluded: 'The policy appears to exclude this risk.',
  unclear: 'Wording was found but it does not clearly answer whether this risk is included.',
  conditional: 'The risk is covered only if certain conditions are met.',
  covered: 'Relevant cover for this risk was found.',
};

const GLOSSARY: Record<string, string> = {
  indemnify:
    'To pay you back for a covered loss so you end up in about the same financial position as before it happened.',
  excess: 'The part of each claim you pay yourself before the insurer pays the rest.',
  exclusion: 'Something the policy says it does not cover.',
};

const QA_DISCLAIMER =
  'This answer only uses this analysis and the policy wording it found. It is decision ' +
  'support, not a legal or binding coverage decision. Confirm it with your insurer or ' +
  'insurance broker.';

const STOPWORDS = new Set(
  'what does about with from that this have will your policy cover covered insurance my am the and for are'.split(
    ' ',
  ),
);

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? [])
    .map((w) => w.replace(/(ies|es|s)$/, ''))
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function citation(assessment: CoverageAssessment): EvidenceCitation | null {
  const clause = assessment.evidence[0];
  if (!clause) return null;
  return {
    chunk_id: clause.chunk_id,
    policy_id: clause.policy_id,
    section: clause.section,
    page: clause.page,
    excerpt: clause.text.slice(0, 400),
    flagged: false,
  };
}

export function mockAnswer(analysis: AnalysisResponse, question: string): QuestionAnswerResponse {
  const base = {
    schema_version: '1.0',
    request_id: newId(),
    generated_by: 'template' as const,
    disclaimer: QA_DISCLAIMER,
    metadata: { llm_used: false, llm_provider: null, llm_model: null, processing_ms: 12 },
  };
  const lower = question.toLowerCase();
  const assessments = analysis.coverage.assessments;

  const term = Object.keys(GLOSSARY).find((t) => lower.includes(t));
  const asked = words(question);
  const matches = assessments.filter(
    (a) =>
      (/\bgaps?\b/.test(lower) && a.potential_gap) ||
      (/\bexclu/.test(lower) && a.status === 'excluded') ||
      (/\bcondition/.test(lower) && a.status === 'conditional') ||
      asked.some((w) => words(a.risk_name).includes(w)),
  );

  if (matches.length > 0) {
    const shown = matches.slice(0, 4);
    const citations = shown
      .map(citation)
      .filter((c): c is EvidenceCitation => c !== null)
      .filter((c, i, all) => all.findIndex((x) => x.chunk_id === c.chunk_id) === i);
    return {
      ...base,
      answerable: true,
      answer: [
        'Here is what this analysis found for the risks your question seems to be about:',
        ...shown.map((a) => `- ${a.risk_name}: ${PLAIN_MEANING[a.status]}`),
      ].join('\n'),
      citations,
      related_risk_ids: shown.map((a) => a.risk_id),
    };
  }
  if (term) {
    return {
      ...base,
      answerable: true,
      answer: `In insurance wording:\n- ${term}: ${GLOSSARY[term]}`,
      citations: [],
      related_risk_ids: [],
    };
  }
  return {
    ...base,
    answerable: false,
    answer:
      `This analysis does not seem to answer that. It looked at: ${assessments.map((a) => a.risk_name).join(', ')}. ` +
      'For anything else, check your policy document or ask your insurer or broker.',
    citations: [],
    related_risk_ids: [],
  };
}
