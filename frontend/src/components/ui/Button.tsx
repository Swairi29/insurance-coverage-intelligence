import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

/**
 * `primary` (navy) is for ordinary actions and the final report; `ai` (indigo) is for actions
 * that start the AI, such as running an analysis.
 */
export type ButtonVariant = 'primary' | 'ai' | 'secondary' | 'ghost' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

// Each variant sets its own focus ring colour, so it stays visible on its background.
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-dark disabled:bg-brand/50 focus-visible:outline-brand',
  ai: 'bg-ai text-white hover:bg-ai-dark disabled:bg-ai/50 focus-visible:outline-ai',
  secondary:
    'border border-line bg-white text-ink-heading hover:border-brand hover:text-brand focus-visible:outline-brand',
  ghost: 'text-muted-strong hover:bg-brand-soft hover:text-brand focus-visible:outline-brand',
  /** On the navy header. */
  inverse:
    'border border-brand-muted/60 text-white hover:border-white hover:bg-white/10 focus-visible:outline-white',
};

// Padding comes from `size`, never from `className`: two padding classes on one element are
// decided by CSS order, not by the order they are written in.
const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5',
  md: 'px-4 py-2.5',
  lg: 'px-5 py-3',
};

/** The button look, for links that should look like buttons. */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md') {
  return `inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonClasses(variant, size)} ${className}`}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" colour="text-current" />}
      {children}
    </button>
  );
}
