import { render, screen } from '@testing-library/react';
import { COVERAGE_STATUSES } from '../api/types';
import { STATUS_LABELS } from '../lib/labels';
import { AnalysisStatusBadge, GapTag, StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it.each(COVERAGE_STATUSES)('shows a text label for %s, not colour alone', (status) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(STATUS_LABELS[status]);
    expect(badge).toHaveAttribute('data-status', status);
  });

  it('uses a different colour class for each status', () => {
    const classes = COVERAGE_STATUSES.map((status) => {
      const { container, unmount } = render(<StatusBadge status={status} />);
      const className = container.firstElementChild!.className;
      unmount();
      return className;
    });
    expect(new Set(classes).size).toBe(COVERAGE_STATUSES.length);
  });

  it('shows the potential gap tag', () => {
    render(<GapTag />);
    expect(screen.getByText('Potential gap')).toBeInTheDocument();
  });

  it('shows complete and partial analysis badges', () => {
    const { rerender } = render(<AnalysisStatusBadge status="complete" />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
    rerender(<AnalysisStatusBadge status="partial" />);
    expect(screen.getByText('Partial – no written report')).toBeInTheDocument();
  });
});
