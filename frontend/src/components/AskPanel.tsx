import { useId, useRef, useState, type FormEvent } from 'react';
import { isApiError } from '../api/client';
import { MAX_QUESTION_CHARS, questionProblem, useAskQuestion } from '../api/questions';
import type { AnalysisResponse, QuestionAnswerResponse } from '../api/types';
import { formatWait } from '../lib/formErrors';
import { AiLabel } from './AiLabel';
import { ErrorMessage } from './ErrorMessage';
import { EvidenceList } from './EvidenceList';
import { InfoIcon, SparkleIcon, WarningIcon } from './icons';
import { Button } from './ui/Button';
import { TEXTAREA_CLASSES, inputBorder } from './ui/fieldStyles';
import { Spinner } from './ui/Spinner';

interface Exchange {
  id: number;
  question: string;
  answer: QuestionAnswerResponse;
}

/** Up to four example questions this analysis can answer, built from its own risks. */
function exampleQuestions(analysis: AnalysisResponse): string[] {
  const assessments = analysis.coverage.assessments;
  const questions: string[] = [];
  if (assessments.some((a) => a.potential_gap)) questions.push('Which risks are potential gaps?');
  const gap = assessments.find((a) => a.status === 'excluded' || a.status === 'not_found');
  if (gap) questions.push(`What does my policy say about ${gap.risk_name.toLowerCase()}?`);
  const conditional = assessments.find((a) => a.status === 'conditional');
  if (conditional) {
    questions.push(`What are the conditions for ${conditional.risk_name.toLowerCase()} cover?`);
  }
  questions.push('What does indemnify mean?');
  return questions.slice(0, 4);
}

/**
 * "Ask about this analysis": one question at a time, answered only from this analysis and the
 * policy wording it found. Answers say whether an AI wrote them and cite their clauses.
 * Nothing is stored; the conversation lasts until the page is left.
 */
export function AskPanel({
  analysis,
  policyNames,
}: {
  analysis: AnalysisResponse;
  policyNames: Record<string, string>;
}) {
  const ask = useAskQuestion(analysis.request_id);
  const [question, setQuestion] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const nextId = useRef(1);
  const inputId = useId();
  const errorId = useId();
  const riskNames = Object.fromEntries(
    analysis.coverage.assessments.map((a) => [a.risk_id, a.risk_name]),
  );

  const send = (text: string) => {
    const issue = questionProblem(text);
    setProblem(issue);
    if (issue || ask.isPending) return;
    const asked = text.trim();
    setPending(asked);
    ask.mutate(
      { question: asked },
      {
        onSuccess: (answer) => {
          setExchanges((list) => [...list, { id: nextId.current++, question: asked, answer }]);
          setQuestion('');
        },
        onSettled: () => setPending(null),
      },
    );
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(question);
  };

  return (
    <section
      aria-labelledby="ask-title"
      className="mt-10 rounded-card border border-ai-border bg-white p-5 shadow-card sm:p-6 print:hidden"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ai-tint text-ai">
          <SparkleIcon className="h-4 w-4" />
        </span>
        <div>
          <h2 id="ask-title" className="text-lg font-bold">
            Ask about this analysis
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Answers only use this analysis and the policy wording it found. They are not stored.
          </p>
        </div>
      </div>

      {/* The conversation, oldest first. */}
      <div aria-live="polite" className="mt-5 space-y-5">
        {exchanges.map((exchange) => (
          <ExchangeView
            key={exchange.id}
            exchange={exchange}
            policyNames={policyNames}
            riskNames={riskNames}
          />
        ))}
        {pending && (
          <div className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-panel bg-brand px-4 py-2 text-sm text-white">
              {pending}
            </p>
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <Spinner className="h-4 w-4" colour="text-ai-bright" />
              Reading this analysis…
            </p>
          </div>
        )}
      </div>

      {ask.isError && <AskError error={ask.error} />}

      <form onSubmit={onSubmit} noValidate className="mt-5">
        {exchanges.length === 0 && (
          <div className="mb-3 flex flex-wrap gap-2" aria-label="Example questions" role="group">
            {exampleQuestions(analysis).map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setQuestion(example);
                  send(example);
                }}
                disabled={ask.isPending}
                className="rounded-pill border border-ai-border bg-ai-tint/60 px-3 py-1.5 text-left text-sm text-ai hover:bg-ai-tint disabled:opacity-60"
              >
                {example}
              </button>
            ))}
          </div>
        )}
        <label htmlFor={inputId} className="block text-sm font-semibold text-ink-heading">
          Your question
        </label>
        <textarea
          id={inputId}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter makes a new line.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(question);
            }
          }}
          rows={2}
          maxLength={MAX_QUESTION_CHARS}
          placeholder="e.g. Am I covered if my oven breaks down?"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? errorId : undefined}
          className={`${TEXTAREA_CLASSES} ${inputBorder(problem)} min-h-[64px] resize-y`}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          {problem ? (
            <p
              id={errorId}
              className="flex items-center gap-1 text-xs font-medium text-status-excluded"
            >
              <WarningIcon className="h-3.5 w-3.5" />
              {problem}
            </p>
          ) : (
            <p className="text-xs text-muted">
              {question.length} / {MAX_QUESTION_CHARS} · Enter to ask, Shift+Enter for a new line
            </p>
          )}
          <Button type="submit" variant="ai" loading={ask.isPending}>
            <SparkleIcon className="h-4 w-4" />
            Ask
          </Button>
        </div>
      </form>
    </section>
  );
}

function ExchangeView({
  exchange,
  policyNames,
  riskNames,
}: {
  exchange: Exchange;
  policyNames: Record<string, string>;
  riskNames: Record<string, string>;
}) {
  const { question, answer } = exchange;
  const related = answer.related_risk_ids.filter((id) => riskNames[id]);
  return (
    <article className="space-y-2" aria-label={`Answer to: ${question}`}>
      <p className="ml-auto w-fit max-w-[85%] rounded-panel bg-brand px-4 py-2 text-sm text-white">
        {question}
      </p>
      <div
        className={`rounded-panel border p-4 ${
          answer.answerable ? 'border-line bg-white' : 'border-line bg-canvas'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-meta font-semibold text-muted">
            {answer.answerable ? 'Answer' : 'Not answered by this analysis'}
          </p>
          <AiLabel kind="finding" value={answer.generated_by} model={answer.metadata.llm_model} />
        </div>
        {/* Plain text; keep the "- " lines of rule-based answers. */}
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">{answer.answer}</p>
        {!answer.answerable && (
          <p className="mt-2 text-xs text-muted">
            The Coverage tab lists every risk this analysis checked.
          </p>
        )}
        {related.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Risks this answer is about">
            {related.map((id) => (
              <li key={id} className="rounded-pill bg-brand-soft px-2.5 py-0.5 text-xs text-brand">
                {riskNames[id]}
              </li>
            ))}
          </ul>
        )}
        {answer.citations.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-bold">Policy wording used</h3>
            <div className="mt-2">
              <EvidenceList items={answer.citations} policyNames={policyNames} />
            </div>
          </div>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
          <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          {answer.disclaimer}
        </p>
      </div>
    </article>
  );
}

function AskError({ error }: { error: unknown }) {
  if (isApiError(error) && error.status === 429) {
    const wait = error.retryAfter ?? 60;
    return (
      <p
        role="alert"
        className="mt-4 rounded-panel border border-status-conditional-border bg-status-conditional-bg px-4 py-3 text-sm text-status-conditional"
      >
        You have asked a lot of questions in a short time. Please wait {formatWait(wait)} and try
        again.
      </p>
    );
  }
  return (
    <div className="mt-4">
      <ErrorMessage title="The question could not be answered" error={error} />
    </div>
  );
}
