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

/** The InsureIntel name with the shield, linking to `to`. */
export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded font-display text-xl font-extrabold text-ink-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
    >
      <ShieldIcon className="h-6 w-6 text-brand" />
      <span>
        Insure<span className="text-brand">Intel</span>
      </span>
    </Link>
  );
}
