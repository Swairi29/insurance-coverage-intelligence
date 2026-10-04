import type { ReactNode } from 'react';
import { Brand } from '../../components/Brand';
import { LockIcon } from '../../components/icons';
import { SampleFinding } from '../../components/SampleFinding';
import { THEFT_EXAMPLE } from '../../lib/examples';

/**
 * The login and register layout: an aurora panel with the value proposition and an example
 * finding on large screens, and the form. Below `lg` only the form is shown.
 */
export function AuthCard({
  title,
  subtitle,
  aside,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  /** Headline of the side panel. */
  aside: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="bg-aurora relative hidden flex-col justify-between overflow-hidden border-r border-line px-12 py-10 lg:flex">
        <Brand />
        <div className="max-w-md">
          <h2 className="text-title font-extrabold">{aside}</h2>
          <p className="mt-3 text-muted-strong">
            Four agents read your business profile and your policy PDFs, then show which risks are
            covered, which are not, and the exact clause behind each answer.
          </p>
          <div className="mt-8">
            <SampleFinding finding={THEFT_EXAMPLE} compact />
          </div>
        </div>
        <p className="text-xs text-muted-strong">
          Academic prototype: InsureIntel does not provide legal, financial or insurance advice.
        </p>
      </aside>

      <div className="flex flex-col items-center px-4 py-10 sm:justify-center">
        <header className="lg:hidden">
          <Brand />
        </header>
        <main className="mt-8 w-full max-w-md rounded-card border border-line bg-white p-6 shadow-card sm:p-8 lg:mt-0">
          <h1 className="text-section font-extrabold">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <p className="mt-6 flex items-start gap-2 border-t border-line pt-4 text-xs text-muted">
            <LockIcon className="mt-px h-3.5 w-3.5 shrink-0 text-brand" />
            Passwords are hashed. Uploaded policies are encrypted at rest.
          </p>
        </main>
        <footer className="mt-6 flex flex-col items-center gap-4 text-center">
          <div className="text-sm text-muted">{footer}</div>
          <p className="max-w-md text-xs text-muted lg:hidden">
            Academic prototype: InsureIntel does not provide legal, financial or insurance advice.
          </p>
        </footer>
      </div>
    </div>
  );
}
