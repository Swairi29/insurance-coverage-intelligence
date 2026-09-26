import { useMemo, useRef, type KeyboardEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAnalysis } from '../../api/analyses';
import { isApiError } from '../../api/client';
import { usePolicies } from '../../api/policies';
import type { AnalysisResponse } from '../../api/types';
import { COVERAGE_STATUSES } from '../../api/types';
import { Disclaimer } from '../../components/Disclaimer';
import { ErrorMessage } from '../../components/ErrorMessage';
import { SparkleIcon } from '../../components/icons';
import { AnalysisStatusBadge, StatusBadge } from '../../components/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { formatDateTime } from '../../lib/format';
import { BUSINESS_TYPE_LABELS } from '../../lib/profile';
import { aiUsage, analysisWarnings, headline, statusCounts } from '../../lib/results';
import { CoverageTab } from './CoverageTab';
import { ReportTab } from './ReportTab';
import { RiskProfileTab } from './RiskProfileTab';

type TabId = 'report' | 'coverage' | 'risks';

const TABS: { id: TabId; label: string }[] = [
  { id: 'report', label: 'Report' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'risks', label: 'Risk profile' },
];

export default function ResultsPage() {
  const { requestId = '' } = useParams();
  const analysis = useAnalysis(requestId);

  if (analysis.isPending) {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading the analysis…
      </div>
    );
  }
  if (analysis.isError) {
    if (isApiError(analysis.error) && analysis.error.status === 404) {
      return (
        <section className="max-w-xl rounded-card border border-line bg-white p-6">
          <h1 className="text-2xl font-extrabold">Analysis not found</h1>
          <p className="mt-2 text-sm text-muted">
            This analysis does not exist, or it belongs to another account.
          </p>
          <Link
            to="/app/analyses"
            className="mt-4 inline-block text-sm font-semibold text-brand hover:underline"
          >
            ← Back to your history
          </Link>
        </section>
      );
    }
    return (
      <ErrorMessage
        title="The analysis could not be loaded"
        error={analysis.error}
        onRetry={() => void analysis.refetch()}
      />
    );
  }
  return <Results analysis={analysis.data} />;
}

function Results({ analysis }: { analysis: AnalysisResponse }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const policies = usePolicies();
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    report: null,
    coverage: null,
    risks: null,
  });

  const partial = analysis.status === 'partial' || !analysis.report;
  const requested = searchParams.get('tab') as TabId | null;
  const tab: TabId =
    requested && TABS.some((t) => t.id === requested) ? requested : partial ? 'coverage' : 'report';

  const policyNames = useMemo(
    () => Object.fromEntries((policies.data ?? []).map((p) => [p.policy_id, p.filename])),
    [policies.data],
  );
  const counts = statusCounts(analysis);
  const warnings = analysisWarnings(analysis);
  const profile = analysis.risk_profile;

  const selectTab = (id: TabId) => {
    setSearchParams({ tab: id }, { replace: true });
    tabRefs.current[id]?.focus();
  };
  // Left / Right / Home / End move between tabs (WAI-ARIA tabs pattern).
  const onTabKey = (event: KeyboardEvent) => {
    const index = TABS.findIndex((t) => t.id === tab);
    const next = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectTab(TABS[next].id);
  };

  return (
    <article className="max-w-5xl">
      <Link to="/app/analyses" className="text-sm font-semibold text-brand hover:underline">
        ← History
      </Link>

      <header className="mt-3 rounded-card border border-line bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <AnalysisStatusBadge status={analysis.status} />
          <span>{formatDateTime(analysis.created_at)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {profile.business_name} ({BUSINESS_TYPE_LABELS[profile.business_type]})
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold leading-snug">{headline(analysis)}</h1>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Findings by status">
          {COVERAGE_STATUSES.filter((status) => counts[status] > 0).map((status) => (
            <li key={status} className="flex items-center gap-1.5 text-sm">
              <StatusBadge status={status} />
              <span className="font-semibold text-ink-heading">{counts[status]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-strong">
          <SparkleIcon className="mt-px h-3.5 w-3.5 shrink-0 text-brand" />
          {aiUsage(analysis)}
        </p>
      </header>

      <div className="mt-4 space-y-3">
        {partial && (
          <Alert tone="warning" title="The written report is not available">
            The coverage results below are complete, but the explanations and recommendations could
            not be generated this time. Run the analysis again later to get the full report.
          </Alert>
        )}
        {warnings.length > 0 && <AnalysisNotes warnings={warnings} />}
        <Disclaimer text={analysis.report?.disclaimer} />
      </div>

      <div
        role="tablist"
        aria-label="Result sections"
        onKeyDown={onTabKey}
        className="mt-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((t) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(t.id)}
              className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
                selected
                  ? 'border-brand text-brand'
                  : 'border-transparent text-muted-strong hover:text-ink-heading'
              }`}
            >
              {t.label}
              {t.id === 'report' && partial && (
                <span className="ml-1 font-normal text-muted">(not available)</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        className="pt-6 focus-visible:outline-none"
      >
        {tab === 'report' && <ReportTab analysis={analysis} policyNames={policyNames} />}
        {tab === 'coverage' && (
          <CoverageTab
            assessments={analysis.coverage.assessments}
            model={analysis.coverage.metadata.llm_model}
            policyNames={policyNames}
          />
        )}
        {tab === 'risks' && <RiskProfileTab profile={analysis.risk_profile} />}
      </div>
    </article>
  );
}

/** The agents' notes. More than a few are collapsed, so they do not push the results down. */
function AnalysisNotes({ warnings }: { warnings: string[] }) {
  return (
    <details
      open={warnings.length <= 3}
      className="group rounded-lg border border-brand-border bg-brand-soft px-4 py-3 text-sm text-muted-strong"
    >
      <summary className="cursor-pointer font-semibold text-ink-heading marker:text-brand">
        Notes about this analysis ({warnings.length})
      </summary>
      <ul className="mt-2 list-disc space-y-0.5 pl-5">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </details>
  );
}
