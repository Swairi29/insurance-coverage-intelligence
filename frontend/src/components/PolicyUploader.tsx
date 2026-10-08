// The policy PDF drop zone and the list of uploads in progress. Used on the Policies page and
// in step 2 of a new analysis, so a missing policy can be added without leaving the flow.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { MAX_UPLOAD_MB, checkPolicyFile, useUploadPolicy } from '../api/policies';
import type { PolicyUploadResponse } from '../api/types';
import { ErrorMessage } from './ErrorMessage';
import { DocumentIcon } from './icons';
import { Button } from './ui/Button';
import { formatBytes } from '../lib/format';

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

export function PolicyUploader({
  compact = false,
  onUploaded,
}: {
  /** A smaller drop zone, for use inside another form. */
  compact?: boolean;
  /** Called for each file the gateway accepted. */
  onUploaded?: (policy: PolicyUploadResponse) => void;
}) {
  const upload = useUploadPolicy();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [dragging, setDragging] = useState(false);
  // An upload can take a while: call the latest callback, not the one from when it started.
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

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
        onUploadedRef.current?.(result);
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

  const busy = uploads.some((row) => row.state === 'uploading');

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="dropzone"
        // Indigo while a file is dragged over or being read: the AI side of the system is working.
        className={`flex flex-col items-center justify-center rounded-card border-2 border-dashed text-center transition-colors ${
          compact ? 'gap-2 px-4 py-5 sm:flex-row sm:gap-4' : 'gap-3 px-6 py-10'
        } ${dragging || busy ? 'border-ai-bright bg-ai-tint' : 'border-line-strong bg-white'}`}
      >
        <DocumentIcon
          className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} ${dragging || busy ? 'text-ai' : 'text-brand'}`}
        />
        {compact ? (
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink-heading">Need another policy?</span> Drop a PDF
            here or
          </p>
        ) : (
          <>
            <p className="font-semibold text-ink-heading">Drag PDF files here</p>
            <p className="text-sm text-muted">or</p>
          </>
        )}
        <Button
          variant={compact ? 'secondary' : 'primary'}
          size={compact ? 'sm' : undefined}
          onClick={() => inputRef.current?.click()}
          loading={busy}
        >
          {compact ? 'Upload a policy PDF' : 'Choose PDF files'}
        </Button>
        {!compact && <p className="text-xs text-muted">PDF only, up to {MAX_UPLOAD_MB} MB each.</p>}
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
    </div>
  );
}

function UploadItem({ row }: { row: UploadRow }) {
  const percent = Math.round(row.progress * 100);
  // Once the bytes are sent, the server reads, splits and indexes the PDF. It reports no
  // progress for that, so the bar becomes an indeterminate one.
  const indexing = row.state === 'uploading' && percent >= 100;
  return (
    <li className="rounded-lg border border-line bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-semibold text-ink-heading" title={row.name}>
          {row.name}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          {formatBytes(row.size)} ·{' '}
          {row.state === 'uploading' &&
            (indexing ? (
              <span className="font-semibold text-ai">Reading &amp; indexing…</span>
            ) : (
              `Uploading ${percent}%`
            ))}
          {row.state === 'done' && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-status-covered">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-status-covered-dot" />
              Uploaded
            </span>
          )}
          {(row.state === 'failed' || row.state === 'rejected') && (
            <span className="text-status-excluded">Not uploaded</span>
          )}
        </span>
      </div>
      {row.state === 'uploading' && (
        <div
          role="progressbar"
          aria-label={indexing ? `Reading and indexing ${row.name}` : `Uploading ${row.name}`}
          aria-valuemin={indexing ? undefined : 0}
          aria-valuemax={indexing ? undefined : 100}
          aria-valuenow={indexing ? undefined : percent}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-ai-tint"
        >
          {indexing ? (
            <div className="h-full w-1/3 rounded-full bg-ai-bright motion-safe:animate-[progress_1.6s_ease-in-out_infinite]" />
          ) : (
            <div
              className="h-full rounded-full bg-ai-bright transition-all"
              style={{ width: `${percent}%` }}
            />
          )}
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
