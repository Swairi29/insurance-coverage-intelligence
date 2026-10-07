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

export function MetricCard({
  label,
  value,
  detail,
  tone = 'blue',
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'blue' | 'cyan' | 'violet' | 'amber';
}) {
  const tones = {
    blue: 'border-blue-100 bg-gradient-to-br from-white to-blue-50/70 text-blue-700',
    cyan: 'border-cyan-100 bg-gradient-to-br from-white to-cyan-50/70 text-cyan-700',
    violet: 'border-indigo-100 bg-gradient-to-br from-white to-indigo-50/70 text-indigo-700',
    amber: 'border-amber-100 bg-gradient-to-br from-white to-amber-50/70 text-amber-700',
  };
  return (
    <article
      className={`rounded-2xl border p-5 shadow-[0_8px_30px_rgba(15,35,70,.035)] ${tones[tone]}`}
    >
      <p className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">{label}</p>
      <p className="mt-3 font-display text-4xl font-extrabold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  );
}
