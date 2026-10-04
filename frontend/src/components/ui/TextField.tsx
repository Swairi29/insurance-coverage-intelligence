import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { WarningIcon } from '../icons';
import { INPUT_CLASSES, TEXTAREA_CLASSES, describedBy, inputBorder } from './fieldStyles';

interface FieldProps {
  label: string;
  /** Shown under the field and announced by screen readers. */
  error?: string | null;
  hint?: ReactNode;
  /** Marks the label as required (visual only; validation is done by the form). */
  required?: boolean;
}

/** Label, hint and error around one control, with the aria wiring done once. */
export function FieldFrame({
  label,
  error,
  hint,
  required,
  inputId,
  className = '',
  children,
}: FieldProps & { inputId: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={inputId} className="block text-sm font-semibold text-ink-heading">
        {label}
        {required && (
          <span className="text-status-excluded" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${inputId}-error`}
          className="mt-1.5 flex items-start gap-1 text-xs font-medium text-status-excluded"
        >
          <WarningIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = FieldProps & InputHTMLAttributes<HTMLInputElement>;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, required, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldFrame {...{ label, error, hint, required, inputId, className }}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={`${INPUT_CLASSES} ${inputBorder(error)}`}
        {...rest}
      />
    </FieldFrame>
  );
});

type TextAreaProps = FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, error, hint, required, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldFrame {...{ label, error, hint, required, inputId, className }}>
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={`${TEXTAREA_CLASSES} ${inputBorder(error)}`}
        {...rest}
      />
    </FieldFrame>
  );
});
