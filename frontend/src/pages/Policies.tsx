import { Link } from 'react-router-dom';
import { MAX_POLICIES_PER_ANALYSIS, usePolicies } from '../api/policies';
import type { PolicyDocument, PolicyStatus } from '../api/types';
import { ErrorMessage } from '../components/ErrorMessage';
import { DocumentIcon, WarningIcon } from '../components/icons';
import { PolicyUploader } from '../components/PolicyUploader';
import { buttonClasses } from '../components/ui/buttonClasses';
import { SkeletonList } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { formatDateTime, plural } from '../lib/format';

export default function Policies() {
  const policies = usePolicies();
  const readyCount = policies.data?.filter((p) => p.status === 'ready').length ?? 0;

  return (
    <section className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Policies</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Upload your insurance policy documents as PDFs. Each file is checked, stored encrypted
            and split into sections so the analysis can find the wording for each risk. You can use
            up to {MAX_POLICIES_PER_ANALYSIS} policies in one analysis.
          </p>
        </div>
        {readyCount > 0 && (
          <Link to="/app/analyses/new/profile" className={buttonClasses()}>
            Start a new analysis →
          </Link>
        )}
      </div>

      <div className="mt-6">
        <PolicyUploader />
      </div>

      <h2 className="mt-10 text-lg font-bold">Your policies</h2>
      <div className="mt-3">
        {policies.isPending ? (
          <SkeletonList label="Loading your policies" />
        ) : policies.isError ? (
          <ErrorMessage
            title="Your policies could not be loaded"
            error={policies.error}
            onRetry={() => void policies.refetch()}
          />
        ) : policies.data.length === 0 ? (
          <div className="rounded-card border border-dashed border-line-strong bg-white px-6 py-10 text-center">
            <p className="font-semibold text-ink-heading">Upload your first policy</p>
            <p className="mt-1 text-sm text-muted">
              Drop a policy PDF above. Once it is ready you can run your first analysis.
            </p>
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Your policies">
            {policies.data.map((policy) => (
              <PolicyItem key={policy.policy_id} policy={policy} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const POLICY_STATUS: Record<PolicyStatus, { label: string; className: string }> = {
  ready: {
    label: 'Ready',
    className: 'border-status-covered-border bg-status-covered-bg text-status-covered',
  },
  // Indigo, not amber: processing is the system at work, not a warning.
  processing: {
    label: 'Processing',
    className: 'border-ai-border bg-ai-tint text-ai',
  },
  failed: {
    label: 'Could not be read',
    className: 'border-status-excluded-border bg-status-excluded-bg text-status-excluded',
  },
};

function PolicyItem({ policy }: { policy: PolicyDocument }) {
  const status = POLICY_STATUS[policy.status];
  return (
    <li className="rounded-card border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <DocumentIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-heading" title={policy.filename}>
              {policy.filename}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {plural(policy.page_count, 'page')} · {plural(policy.chunk_count, 'section')} ·
              uploaded {formatDateTime(policy.uploaded_at)}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
        >
          {policy.status === 'processing' && (
            <Spinner className="h-3 w-3" colour="text-ai-bright" />
          )}
          {status.label}
        </span>
      </div>
      {policy.status === 'ready' && policy.chunk_count === 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-status-conditional-bg px-3 py-2 text-xs text-status-conditional">
          <WarningIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          No policy text could be read from this file, so it cannot provide evidence for any risk.
          If it is a scanned document, upload a text-based PDF instead.
        </p>
      )}
      {policy.flagged_chunk_count > 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-status-conditional-bg px-3 py-2 text-xs text-status-conditional">
          <WarningIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          {plural(policy.flagged_chunk_count, 'section')} contained text that looked like
          instructions. {policy.flagged_chunk_count === 1 ? 'It is' : 'They are'} kept as policy
          wording but never sent to the AI.
        </p>
      )}
    </li>
  );
}
