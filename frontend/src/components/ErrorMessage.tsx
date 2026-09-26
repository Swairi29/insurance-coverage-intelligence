import { GENERIC_ERROR_MESSAGE, isApiError } from '../api/client';
import { STAGE_LABELS } from '../lib/labels';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';

/**
 * Shows any failed API call in words the user can act on (plan §3.3). It only uses the
 * gateway's own `message`, which is written for users, and never shows raw JSON or a stack.
 */
export function ErrorMessage({
  error,
  title = 'Something went wrong',
  onRetry,
}: {
  error: unknown;
  title?: string;
  /** Adds a "Try again" button. */
  onRetry?: () => void;
}) {
  const apiError = isApiError(error) ? error : null;
  const message = apiError?.message ?? GENERIC_ERROR_MESSAGE;
  const stage = apiError?.stage;
  // 422 details for fields the page does not show next to an input.
  const details = apiError?.status === 422 ? apiError.details : [];

  return (
    <Alert tone="error" title={title}>
      <p>{message}</p>
      {stage && (
        <p className="mt-1">
          The problem happened at this step: <strong>{STAGE_LABELS[stage]}</strong>.
        </p>
      )}
      {details.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {details.map((detail) => (
            <li key={`${detail.field}-${detail.message}`}>{detail.message}</li>
          ))}
        </ul>
      )}
      {apiError?.requestId && (
        <p className="mt-2 text-xs opacity-80">Reference: {apiError.requestId}</p>
      )}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-3">
          Try again
        </Button>
      )}
    </Alert>
  );
}
