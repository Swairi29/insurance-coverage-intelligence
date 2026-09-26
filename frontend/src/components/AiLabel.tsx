import type { AnalysisMethod, GeneratedBy, RiskSource } from '../api/types';
import { SparkleIcon } from './icons';

/**
 * "Who wrote this" for one item (plan §4):
 * - a report finding: `generated_by` (Agent 4)
 * - a coverage assessment: `method` (Agent 3)
 * - an identified risk: `source` (Agent 1)
 */
export type AiLabelProps =
  | { kind: 'finding'; value: GeneratedBy; model?: string | null }
  | { kind: 'assessment'; value: AnalysisMethod; model?: string | null }
  | { kind: 'risk'; value: RiskSource; model?: string | null };

interface Resolved {
  text: string;
  usesAi: boolean;
  explanation: string;
}

function resolve(props: AiLabelProps): Resolved {
  switch (props.kind) {
    case 'finding':
      return props.value === 'llm'
        ? {
            text: 'AI-written',
            usesAi: true,
            explanation: 'This explanation was written by an AI model',
          }
        : {
            text: 'Template',
            usesAi: false,
            explanation: 'This explanation uses standard template wording',
          };
    case 'assessment':
      return props.value === 'rules+llm'
        ? {
            text: 'AI-assisted',
            usesAi: true,
            explanation: 'Coverage rules were checked with the help of an AI model',
          }
        : {
            text: 'Rules',
            usesAi: false,
            explanation: 'This status comes from coverage rules only',
          };
    case 'risk':
      if (props.value === 'llm') {
        return { text: 'AI', usesAi: true, explanation: 'This risk was suggested by an AI model' };
      }
      if (props.value === 'rule+llm') {
        return {
          text: 'Rules + AI',
          usesAi: true,
          explanation: 'Found by the risk rules and confirmed by an AI model',
        };
      }
      return { text: 'Rules', usesAi: false, explanation: 'Found by the risk rules' };
  }
}

export function AiLabel(props: AiLabelProps) {
  const { text, usesAi, explanation } = resolve(props);
  const tooltip = usesAi && props.model ? `${explanation} (${props.model}).` : `${explanation}.`;
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        usesAi ? 'bg-brand-tint text-brand' : 'bg-status-unclear-bg text-status-unclear'
      }`}
    >
      {usesAi && <SparkleIcon className="h-3 w-3" />}
      <span>{text}</span>
      <span className="sr-only"> – {tooltip}</span>
    </span>
  );
}
