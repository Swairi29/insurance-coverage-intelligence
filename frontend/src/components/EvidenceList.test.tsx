import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EvidenceCitation, EvidenceClause } from '../api/types';
import { allStatusesAnalysis } from '../mocks/fixtures';
import { COLLAPSE_AFTER_CHARS, EvidenceList, FLAGGED_MESSAGE } from './EvidenceList';

const clause = (overrides: Partial<EvidenceClause> = {}): EvidenceClause => ({
  chunk_id: 'POL-1-p1-c0',
  policy_id: 'POL-1',
  section: 'Section 1 - Fire',
  page: 1,
  text: 'We will pay for loss caused by fire.',
  score: 0.6,
  ...overrides,
});

const citation = (overrides: Partial<EvidenceCitation> = {}): EvidenceCitation => ({
  chunk_id: 'POL-2-p5-c0',
  policy_id: 'POL-2',
  section: null,
  page: 5,
  excerpt: 'Flood is excluded.',
  flagged: false,
  ...overrides,
});

describe('EvidenceList', () => {
  it('shows policy name, section, page and text for Agent 3 clauses', () => {
    render(<EvidenceList items={[clause()]} policyNames={{ 'POL-1': 'business-pack.pdf' }} />);

    expect(screen.getByText('business-pack.pdf')).toBeInTheDocument();
    expect(screen.getByText('Section 1 - Fire')).toBeInTheDocument();
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.getByText('We will pay for loss caused by fire.')).toBeInTheDocument();
  });

  it('shows Agent 4 citations, falling back to the policy id and a missing section', () => {
    render(<EvidenceList items={[citation()]} />);

    expect(screen.getByText('POL-2')).toBeInTheDocument();
    expect(screen.getByText('Section not detected')).toBeInTheDocument();
    expect(screen.getByText('Flood is excluded.')).toBeInTheDocument();
  });

  it('warns on a flagged clause', () => {
    render(<EvidenceList items={[citation({ flagged: true }), citation({ chunk_id: 'other' })]} />);

    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText(FLAGGED_MESSAGE)).toBeInTheDocument();
    expect(within(items[1]).queryByText(FLAGGED_MESSAGE)).not.toBeInTheDocument();
  });

  it('shows the flagged clause from the real fixture with a warning', () => {
    const flagged = allStatusesAnalysis
      .report!.findings.flatMap((finding) => finding.evidence)
      .filter((e) => e.flagged);
    expect(flagged.length).toBeGreaterThan(0);

    render(<EvidenceList items={flagged.slice(0, 1)} />);
    expect(screen.getByText(FLAGGED_MESSAGE)).toBeInTheDocument();
  });

  it('renders HTML in policy text as plain text, never as markup', () => {
    const hostile = '<img src=x onerror="alert(1)"><b>bold</b><script>alert(2)</script>';
    const { container } = render(<EvidenceList items={[citation({ excerpt: hostile })]} />);

    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(container.querySelector('img, b, script')).toBeNull();
  });

  it('collapses long text and expands it on request', async () => {
    const user = userEvent.setup();
    const long = `${'Cover applies only when conditions are met. '.repeat(12)}END-OF-CLAUSE`;
    expect(long.length).toBeGreaterThan(COLLAPSE_AFTER_CHARS);
    render(<EvidenceList items={[clause({ text: long })]} />);

    expect(screen.queryByText(/END-OF-CLAUSE/)).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Show more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(screen.getByText(/END-OF-CLAUSE/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('says so when there is no evidence', () => {
    render(<EvidenceList items={[]} />);
    expect(screen.getByText('No policy wording was found for this risk.')).toBeInTheDocument();
  });
});
