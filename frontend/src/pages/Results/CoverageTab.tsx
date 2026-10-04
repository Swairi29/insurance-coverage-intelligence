import { useCallback, useState } from 'react';
import type { AnalysisResponse, CoverageAssessment, CoverageStatus } from '../../api/types';
import { COVERAGE_STATUSES } from '../../api/types';
import { AiLabel } from '../../components/AiLabel';
import { ConfidenceLabel } from '../../components/ConfidenceLabel';
import { EvidenceDrawer } from '../../components/EvidenceDrawer';
import { StatusBadge } from '../../components/StatusBadge';
import { plural } from '../../lib/format';
import { STATUS_LABELS } from '../../lib/labels';
import { STATUS_SEVERITY, sortBySeverity } from '../../lib/results';

type Filter = 'all' | 'gaps' | CoverageStatus;

// Chips in the order the md asks for: All, Potential gaps, then the statuses.
const STATUS_CHIPS = [...COVERAGE_STATUSES].sort((a, b) => STATUS_SEVERITY[b] - STATUS_SEVERITY[a]);

/** Agent 3's decision for every risk, with filter chips and the evidence behind each one. */
export function CoverageTab({
  analysis,
  policyNames,
}: {
  analysis: AnalysisResponse;
  policyNames: Record<string, string>;
}) {
  const assessments = analysis.coverage.assessments;
  const model = analysis.coverage.metadata.llm_model;
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), []);

  const matches = (a: CoverageAssessment) =>
    filter === 'all' || (filter === 'gaps' ? a.potential_gap : a.status === filter);
  const rows = sortBySeverity(assessments).filter(matches);
  const open = assessments.find((a) => a.risk_id === openId);

  const chips: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: assessments.length },
    {
      id: 'gaps',
      label: 'Potential gaps',
      count: assessments.filter((a) => a.potential_gap).length,
    },
    ...STATUS_CHIPS.map((s) => ({
      id: s,
      label: STATUS_LABELS[s],
      count: assessments.filter((a) => a.status === s).length,
    })),
  ];

  return (
    <div>
      <div className="print:hidden">
        <div role="group" aria-label="Filter risks" className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const active = filter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(chip.id)}
                className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-white text-muted-strong hover:border-brand hover:text-brand'
                }`}
              >
                {chip.label}
                <span
                  className={`rounded-pill px-1.5 text-xs ${active ? 'bg-white/20' : 'bg-canvas text-muted'}`}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-muted" role="status">
          Showing {rows.length} of {plural(assessments.length, 'risk')}. Select a risk to see its
          evidence.
        </p>
      </div>

      {/* Phones: one card per risk. */}
      <ul className="mt-4 space-y-3 md:hidden print:hidden" aria-label="Risks">
        {rows.length === 0 && <li className="text-sm text-muted">No risks match this filter.</li>}
        {rows.map((a) => (
          <li key={a.risk_id}>
            <button
              type="button"
              onClick={() => setOpenId(a.risk_id)}
              className="w-full rounded-panel border border-line bg-white p-4 text-left shadow-soft hover:border-brand"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold text-ink-heading">{a.risk_name}</span>
                <StatusBadge status={a.status} />
              </span>
              <span className="mt-1 block text-sm text-muted-strong">{a.reason}</span>
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {a.potential_gap && (
                  <span className="font-semibold text-status-excluded">Potential gap</span>
                )}
                <ConfidenceLabel value={a.confidence} />
                <span className="text-muted">{plural(a.evidence.length, 'clause')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Desktop and print: the table. `relative` contains the sr-only caption. */}
      <div className="relative mt-4 hidden overflow-x-auto rounded-card border border-line bg-white shadow-soft md:block print:block print:overflow-visible">
        {/* On paper the table must fit the page width: fixed columns, smaller text. */}
        <table className="w-full min-w-[720px] text-left text-sm print:min-w-0 print:table-fixed print:text-xs print:[&_td]:px-2 print:[&_th]:px-2">
          <caption className="sr-only">Coverage status for each identified risk</caption>
          <colgroup>
            <col className="print:w-[22%]" />
            <col className="print:w-[17%]" />
            <col className="print:w-[10%]" />
            <col className="print:w-[13%]" />
            <col className="print:w-[28%]" />
            <col className="print:w-[10%]" />
          </colgroup>
          <thead className="border-b border-line bg-canvas text-xs uppercase tracking-wide text-muted-strong">
            <tr>
              <th scope="col" className="px-4 py-3">
                Risk
              </th>
              <th scope="col" className="px-4 py-3">
                Status
              </th>
              <th scope="col" className="px-4 py-3">
                Gap
              </th>
              <th scope="col" className="px-4 py-3">
                Confidence
              </th>
              <th scope="col" className="px-4 py-3">
                Reason
              </th>
              <th scope="col" className="px-4 py-3">
                Method
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  No risks match this filter.
                </td>
              </tr>
            )}
            {rows.map((a) => (
              <tr
                key={a.risk_id}
                className="border-t border-line align-top first:border-t-0 hover:bg-brand-soft/60 print:break-inside-avoid"
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setOpenId(a.risk_id)}
                    className="text-left font-semibold text-ink-heading hover:text-brand hover:underline"
                  >
                    {a.risk_name}
                  </button>
                  <p className="text-xs text-muted">{plural(a.evidence.length, 'clause')}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-4 py-3 font-semibold">
                  {a.potential_gap ? (
                    <span className="text-status-excluded">Potential gap</span>
                  ) : (
                    <span className="text-muted">No</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <ConfidenceLabel value={a.confidence} />
                </td>
                <td className="max-w-sm px-4 py-3 text-muted-strong">{a.reason}</td>
                <td className="px-4 py-3">
                  <AiLabel kind="assessment" value={a.method} model={model} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <EvidenceDrawer
          assessment={open}
          risk={analysis.risk_profile.risks.find((r) => r.risk_id === open.risk_id)}
          finding={analysis.report?.findings.find((f) => f.risk_id === open.risk_id)}
          model={analysis.report?.metadata.llm_model ?? null}
          policyNames={policyNames}
          onClose={close}
        />
      )}
    </div>
  );
}
