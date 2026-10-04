// The button look, shared by <Button> and links that look like buttons.

/**
 * `primary` (navy) is for ordinary actions and the final report; `ai` (indigo) is for actions
 * that start the AI, such as running an analysis.
 */
export type ButtonVariant = 'primary' | 'ai' | 'secondary' | 'ghost' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

// Focus uses the global ring (index.css), so variants only set colours.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white shadow-soft hover:bg-brand-dark disabled:bg-brand/50',
  ai: 'bg-ai text-white shadow-soft hover:bg-ai-dark disabled:bg-ai/50',
  secondary:
    'border border-line bg-white text-ink-heading shadow-soft hover:border-brand hover:text-brand',
  ghost: 'text-muted-strong hover:bg-brand-soft hover:text-brand',
  /** On a navy background. */
  inverse: 'border border-brand-muted/60 text-white hover:border-white hover:bg-white/10',
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
  return `inline-flex items-center justify-center gap-2 rounded-control text-sm font-semibold transition-colors disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]}`;
}
