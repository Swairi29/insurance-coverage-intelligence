import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  MAX_POLICIES_PER_ANALYSIS,
  MAX_UPLOAD_MB,
  checkPolicyFile,
  usePolicies,
  useUploadPolicy,
} from '../api/policies';
import type { PolicyDocument, PolicyStatus } from '../api/types';
import { ErrorMessage } from '../components/ErrorMessage';
import { DocumentIcon, WarningIcon } from '../components/icons';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatBytes, formatDateTime, plural } from '../lib/format';

type UploadState = 'uploading' | 'done' | 'failed' | 'rejected';

interface UploadRow {
  key: string;
  name: string;
  size: number;
  state: UploadState;
  progress: number;
  /** An ApiError from the gateway, or a message from the client-side check. */
  error?: unknown;
  warnings?: string[];
}

let uploadCounter = 0;

export default function Policies() {
  const policies = usePolicies();
  const upload = useUploadPolicy();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [dragging, setDragging] = useState(false);

  const updateRow = (key: string, change: Partial<UploadRow>) =>
    setUploads((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));

  /** Checks every file, then uploads the good ones one after another. */
  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      const key = `upload-${++uploadCounter}`;
      const problem = checkPolicyFile(file);
      const row: UploadRow = {
        key,
        name: file.name,
        size: file.size,
        state: problem ? 'rejected' : 'uploading',
        progress: 0,
        error: problem ?? undefined,
      };
      setUploads((rows) => [row, ...rows]);
      if (problem) continue;
      try {
        const result = await upload.mutateAsync({
          file,
          onProgress: (fraction) => updateRow(key, { progress: fraction }),
        });
        updateRow(key, { state: 'done', progress: 1, warnings: result.warnings });
      } catch (error) {
        updateRow(key, { state: 'failed', error });
      }
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void handleFiles(Array.from(event.dataTransfer.files));
  };

  const readyCount = policies.data?.filter((p) => p.status === 'ready').length ?? 0;
  const busy = uploads.some((row) => row.state === 'uploading');

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
          <Link
            to="/app/analyses/new"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Start a new analysis →
          </Link>
        )}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="dropzone"
        className={`mt-6 flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? 'border-brand bg-brand-tint' : 'border-line bg-white'
        }`}
      >
        <DocumentIcon className="h-8 w-8 text-brand" />
        <p className="font-semibold text-ink-heading">Drag PDF files here</p>
        <p className="text-sm text-muted">or</p>
        <Button onClick={() => inputRef.current?.click()} loading={busy}>
          Choose PDF files
        </Button>
        <p className="text-xs text-muted">PDF only, up to {MAX_UPLOAD_MB} MB each.</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          aria-label="Upload policy PDFs"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = ''; // so the same file can be picked again
            void handleFiles(files);
          }}
        />
      </div>

      {uploads.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-strong">Uploads</h2>
            {!busy && (
              <button
                type="button"
                onClick={() => setUploads([])}
                className="text-xs font-semibold text-brand hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <ul className="mt-2 space-y-2" aria-label="Uploads">
            {uploads.map((row) => (
              <UploadItem key={row.key} row={row} />
            ))}
          </ul>
        </div>
      )}

      <h2 className="mt-10 text-lg font-bold">Your policies</h2>
      <div className="mt-3">
        {policies.isPending ? (
          <div role="status" className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Loading your policies…
          </div>
        ) : policies.isError ? (
          <ErrorMessage
            title="Your policies could not be loaded"
            error={policies.error}
            onRetry={() => void policies.refetch()}
          />
        ) : policies.data.length === 0 ? (
          <div className="rounded-card border border-line bg-white px-6 py-10 text-center">
            <p className="font-semibold text-ink-heading">No policies yet</p>
            <p className="mt-1 text-sm text-muted">
              Upload at least one policy PDF to run an analysis.
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

function UploadItem({ row }: { row: UploadRow }) {
  const percent = Math.round(row.progress * 100);
  return (
    <li className="rounded-lg border border-line bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-semibold text-ink-heading" title={row.name}>
          {row.name}
        </span>
        <span className="text-xs text-muted">
          {formatBytes(row.size)} ·{' '}
          {row.state === 'uploading' && (percent < 100 ? `Uploading ${percent}%` : 'Processing…')}
          {row.state === 'done' && <span className="text-status-covered">Uploaded</span>}
          {(row.state === 'failed' || row.state === 'rejected') && (
            <span className="text-status-excluded">Not uploaded</span>
          )}
        </span>
      </div>
      {row.state === 'uploading' && (
        <div
          role="progressbar"
          aria-label={`Uploading ${row.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-tint"
        >
          <div className="h-full bg-brand transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}
      {row.state === 'rejected' && (
        <p role="alert" className="mt-1 text-sm text-status-excluded">
          {String(row.error)}
        </p>
      )}
      {row.state === 'failed' && (
        <div className="mt-2">
          <ErrorMessage title="The upload failed" error={row.error} />
        </div>
      )}
      {row.warnings?.map((warning) => (
        <p key={warning} className="mt-1 text-xs text-status-conditional">
          {warning}
        </p>
      ))}
    </li>
  );
}

const POLICY_STATUS: Record<PolicyStatus, { label: string; className: string }> = {
  ready: {
    label: 'Ready',
    className: 'border-status-covered-border bg-status-covered-bg text-status-covered',
  },
  processing: {
    label: 'Processing',
    className: 'border-status-unclear-border bg-status-unclear-bg text-status-unclear',
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
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
        >
          {status.label}
        </span>
      </div>
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
