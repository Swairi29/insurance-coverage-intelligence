import type { ReactNode } from 'react';
import { Brand } from '../../components/Brand';
import { LockIcon } from '../../components/icons';

/**
 * The login and register layout: an aurora panel with the value proposition and an example
 * finding on large screens, and the form. Below `lg` only the form is shown.
 */
export function AuthCard({
  title,
  subtitle,
  aside,
  imageSrc,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  /** Headline of the side panel. */
  aside: string;
  imageSrc: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="dark-ui grid min-h-screen bg-[#050b18] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="relative hidden min-h-screen flex-col justify-between overflow-hidden border-r border-blue-200/10 bg-[#061126] px-10 py-9 text-white lg:flex xl:px-14">
        <img
          src={imageSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-55"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(120deg,rgba(2,8,23,.96)_0%,rgba(4,16,39,.76)_48%,rgba(3,12,29,.8)_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute -right-24 top-12 h-80 w-80 rounded-full bg-blue-500/20 blur-[100px]"
        />
        <div className="relative z-10 flex items-center justify-between">
          <Brand tone="dark" />
          <span className="rounded-full border border-cyan-200/20 bg-slate-950/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-cyan-100">
            Evidence first
          </span>
        </div>
        <div className="relative z-10 max-w-lg">
          <p className="inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-950/50 px-3 py-1.5 text-xs font-semibold text-blue-100 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> Insurance intelligence
            workspace
          </p>
          <h2 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-white xl:text-5xl">
            {aside}
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-blue-100/80">
            Four connected agents review business risks and policy wording, then connect coverage
            findings to the evidence behind them.
          </p>
          <ol className="mt-8 grid max-w-md grid-cols-2 gap-x-5 gap-y-3 border-t border-white/15 pt-5 text-xs text-blue-50/85">
            {['Risk profiling', 'Policy evidence', 'Coverage analysis', 'Clear explanations'].map(
              (item, index) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-blue-200/20 bg-blue-400/10 text-[9px] font-bold text-cyan-100">
                    0{index + 1}
                  </span>
                  {item}
                </li>
              ),
            )}
          </ol>
        </div>
        <p className="relative z-10 text-xs text-blue-100/70">
          Academic prototype · Decision support, not legal, financial or insurance advice.
        </p>
      </aside>

      <div className="flex flex-col items-center px-4 py-10 sm:justify-center">
        <header className="lg:hidden">
          <Brand />
        </header>
        <main className="mt-8 w-full max-w-md rounded-3xl border border-blue-200/10 bg-[#0b1930]/95 p-6 text-white shadow-[0_24px_70px_rgba(0,0,0,.32)] backdrop-blur-xl sm:p-8 lg:mt-0">
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
