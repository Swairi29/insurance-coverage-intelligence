import type { ReactNode } from 'react';
import { Brand } from '../../components/Brand';

/** Centered card used by the login and register pages. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-brand-soft/40 px-4 py-10">
      <Brand />
      <main className="mt-8 w-full max-w-md rounded-[20px] border border-line bg-white p-6 shadow-[0_12px_40px_#172b4d0f] sm:p-8">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </main>
      <div className="mt-6 text-sm text-muted">{footer}</div>
      <p className="mt-6 max-w-md text-center text-xs text-muted">
        Academic prototype: InsureIntel does not provide legal, financial or insurance advice.
      </p>
    </div>
  );
}
