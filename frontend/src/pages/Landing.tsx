import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';

// Minimal until step 7 builds the full landing page from LANDING_CONTENT.md.
export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Brand />
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link
            to="/login"
            className="px-3 py-2 text-sm font-semibold text-muted-strong hover:text-brand"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Get started
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-20">
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-6xl">
          Understand your risks.
          <br />
          <span className="text-brand">Discover your coverage gaps.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          InsureIntel helps small and medium-sized businesses analyse business risks and insurance
          policies through a structured, evidence-based workflow.
        </p>
      </main>
    </div>
  );
}
