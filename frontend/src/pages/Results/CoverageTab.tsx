import { Fragment, useId, useState } from 'react';
import type { CoverageAssessment, CoverageStatus } from '../../api/types';
import { COVERAGE_STATUSES } from '../../api/types';
import { AiLabel } from '../../components/AiLabel';
import { ConfidenceLabel } from '../../components/ConfidenceLabel';
import { EvidenceList } from '../../components/EvidenceList';
import { StatusBadge } from '../../components/StatusBadge';
import { INPUT_CLASSES, inputBorder } from '../../components/ui/fieldStyles';
import { plural } from '../../lib/format';
import { STATUS_LABELS } from '../../lib/labels';
import { sortBySeverity } from '../../lib/results';

/** Agent 3's decision for every risk, with filters and the evidence behind each row. */
export function CoverageTab({
  assessments,
  model,
  policyNames,
}: {
  assessments: CoverageAssessment[];
  model: string | null;
  policyNames: Record<string, string>;
}) {
  const filterId = useId();
  const [status, setStatus] = useState<CoverageStatus | 'all'>('all');
  const [gapsOnly, setGapsOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const rows = sortBySeverity(assessments).filter(
    (a) => (status === 'all' || a.status === status) && (!gapsOnly || a.potential_gap),
  );
  const countFor = (s: CoverageStatus) => assessments.filter((a) => a.status === s).length;

  const toggle = (riskId: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(riskId)) next.delete(riskId);
      else next.add(riskId);
      return next;
    });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor={filterId} className="block text-sm font-semibold text-ink-heading">
            Status
          </label>
          <select
            id={filterId}
            value={status}
            onChange={(e) => setStatus(e.target.value as CoverageStatus | 'all')}
            className={`${INPUT_CLASSES} ${inputBorder()} w-64`}
          >
            <option value="all">All statuses ({assessments.length})</option>
            {COVERAGE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]} ({countFor(s)})
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-sm font-medium text-ink-heading">
          <input
            type="checkbox"
            checked={gapsOnly}
            onChange={(e) => setGapsOnly(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Potential gaps only
        </label>
        <p className="pb-2.5 text-sm text-muted" role="status">
          Showing {rows.length} of {plural(assessments.length, 'risk')}
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Coverage status for each identified risk</caption>
          <thead className="border-b border-line bg-brand-soft/60 text-xs uppercase tracking-wide text-muted-strong">
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
                  No risks match these filters.
                </td>
              </tr>
            )}
            {rows.map((a) => {
              const expanded = open.has(a.risk_id);
              const panelId = `evidence-${a.risk_id}`;
              return (
                <Fragment key={a.risk_id}>
                  <tr className="border-t border-line align-top first:border-t-0">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => toggle(a.risk_id)}
                        className="flex items-start gap-1.5 text-left font-semibold text-ink-heading hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 inline-block text-xs text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
                        >
                          ▶
                        </span>
                        {a.risk_name}
                      </button>
                      <p className="ml-4 text-xs text-muted">
                        {plural(a.evidence.length, 'clause')}
                      </p>
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
                  {expanded && (
                    <tr id={panelId} className="bg-brand-soft/40">
                      <td colSpan={6} className="px-4 pb-4 pt-2">
                        <EvidenceList items={a.evidence} policyNames={policyNames} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
