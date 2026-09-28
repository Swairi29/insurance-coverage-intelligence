import { Link } from 'react-router-dom';

export function ShieldIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

/** `light` for light backgrounds, `dark` for the navy header. */
export type Tone = 'light' | 'dark';

const TONES: Record<Tone, { text: string; accent: string; focus: string }> = {
  light: { text: 'text-ink-heading', accent: 'text-brand', focus: 'focus-visible:outline-brand' },
  dark: { text: 'text-white', accent: 'text-ai-border', focus: 'focus-visible:outline-white' },
};

/** The InsureIntel name with the shield, linking to `to`. */
export function Brand({ to = '/', tone = 'light' }: { to?: string; tone?: Tone }) {
  const colours = TONES[tone];
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 rounded font-display text-xl font-extrabold focus-visible:outline focus-visible:outline-2 ${colours.text} ${colours.focus}`}
    >
      <ShieldIcon className={`h-6 w-6 ${colours.accent}`} />
      <span>
        Insure<span className={colours.accent}>Intel</span>
      </span>
    </Link>
  );
}
