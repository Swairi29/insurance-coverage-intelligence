import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-[2.1rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}
