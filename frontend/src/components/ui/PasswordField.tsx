import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { EyeIcon, EyeOffIcon, WarningIcon } from '../icons';
import { INPUT_CLASSES, describedBy, inputBorder } from './fieldStyles';
import { FieldFrame } from './TextField';

type PasswordFieldProps = {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  required?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * A password input with a show/hide button and a Caps Lock warning. The button is a real
 * <button> with aria-pressed, so screen readers hear whether the password is visible.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    {
      label,
      error,
      hint,
      required,
      id,
      className,
      onKeyUp,
      onKeyDown,
      onBlur,
      'aria-describedby': extraDescribedBy,
      ...rest
    },
    ref,
  ) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const capsId = `${inputId}-caps`;
    const [visible, setVisible] = useState(false);
    const [capsLock, setCapsLock] = useState(false);

    const describedIds = [
      describedBy(inputId, hint, error),
      capsLock ? capsId : undefined,
      extraDescribedBy,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <FieldFrame {...{ label, error, hint, required, inputId, className }}>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? 'text' : 'password'}
            aria-invalid={error ? true : undefined}
            aria-required={required || undefined}
            aria-describedby={describedIds || undefined}
            className={`${INPUT_CLASSES} ${inputBorder(error)} pr-12`}
            onKeyUp={(event) => {
              setCapsLock(event.getModifierState('CapsLock'));
              onKeyUp?.(event);
            }}
            onKeyDown={(event) => {
              setCapsLock(event.getModifierState('CapsLock'));
              onKeyDown?.(event);
            }}
            onBlur={(event) => {
              setCapsLock(false);
              onBlur?.(event);
            }}
            {...rest}
          />
          <button
            type="button"
            aria-pressed={visible}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-controls={inputId}
            onClick={() => setVisible((value) => !value)}
            className="absolute right-1.5 top-1/2 mt-[3px] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-control text-muted-strong hover:bg-brand-soft hover:text-brand"
          >
            {visible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>
        {capsLock && (
          <p
            id={capsId}
            className="mt-1.5 flex items-center gap-1 text-xs font-medium text-status-conditional"
          >
            <WarningIcon className="h-3.5 w-3.5 shrink-0" />
            Caps Lock is on.
          </p>
        )}
      </FieldFrame>
    );
  },
);
