import { screen, within } from '@testing-library/react';
import type { AnalysisResponse } from '../../api/types';
import { COVERAGE_STATUSES } from '../../api/types';
import { STATUS_LABELS } from '../../lib/labels';
import { FLAGGED_MESSAGE } from '../../components/EvidenceList';
import { allStatusesAnalysis, analysisByType, partialAnalysis } from '../../mocks/fixtures';
import { renderApp } from '../../test/renderApp';
import { loginAsDemoUser } from '../../test/session';

const bakery = analysisByType.bakery;

/** The "AI used" line the header should show for a fixture (Agents 1 and 3 are rule-based). */
function aiUsedText(analysis: AnalysisResponse): string {
  const meta = analysis.report?.metadata;
  if (!meta?.llm_used || meta.llm_findings === 0) {
    return 'No AI model was used; these results are rule-based and use standard wording.';
  }
  const total = meta.llm_findings + meta.template_findings;
  return `AI used: ${meta.llm_model} via Ollama (report: ${meta.llm_findings} of ${total} findings).`;
}
const location = () => screen.getByTestId('location').textContent;

async function openResults(requestId: string, query = '') {
  loginAsDemoUser();
  const result = renderApp(`/app/analyses/${requestId}${query}`);
  await screen.findByRole('tablist', { name: 'Result sections' });
  return result;
}

const findingCards = () =>
  screen
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.closest('li') as HTMLElement)
    .filter(Boolean);

describe('results header', () => {
  it('shows the headline, counts, AI use, disclaimer and warnings once each', async () => {
    await openResults(bakery.request_id);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      bakery.report!.summary.headline,
    );
    expect(screen.getByText('Complete')).toBeInTheDocument();
    const counts = screen.getByRole('list', { name: 'Findings by status' });
    expect(counts).toHaveTextContent(`${STATUS_LABELS.not_found}6`);
    expect(counts).toHaveTextContent(`${STATUS_LABELS.unclear}8`);
    expect(screen.getByText(aiUsedText(bakery))).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Disclaimer' })).toHaveTextContent(
      bakery.report!.disclaimer,
    );

    // Agent 4 repeats the same flagged-clause warning; it is shown once.
    const repeated = bakery.report!.warnings[0];
    expect(bakery.report!.warnings.filter((w) => w === repeated).length).toBeGreaterThan(1);
    expect(screen.getAllByText(repeated)).toHaveLength(1);
  });

  it('names the model when AI wrote part of the report', async () => {
    await openResults(allStatusesAnalysis.request_id);
    expect(screen.getByText(aiUsedText(allStatusesAnalysis))).toBeInTheDocument();
  });

  it('shows "Analysis not found" for an unknown id', async () => {
    loginAsDemoUser();
    renderApp('/app/analyses/does-not-exist');

    expect(await screen.findByRole('heading', { name: 'Analysis not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to your history' })).toHaveAttribute(
      'href',
      '/app/analyses',
    );
  });
});

describe('report tab', () => {
  it('opens by default and lists every finding, high priority first', async () => {
    await openResults(allStatusesAnalysis.request_id);

    expect(screen.getByRole('tab', { name: 'Report' })).toHaveAttribute('aria-selected', 'true');
    const report = allStatusesAnalysis.report!;
    expect(findingCards()).toHaveLength(report.findings.length);

    const sections = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
      .filter((t) => /priority/.test(t ?? ''));
    expect(sections).toEqual(['High priority (6)', 'Medium priority (7)', 'Low priority (1)']);
  });

  it('shows status, gap, verify and AI labels, the recommendation and the evidence', async () => {
    await openResults(allStatusesAnalysis.request_id);

    const excluded = findingCards().find((c) => c.textContent?.includes('Excluded: Equipment'))!;
    expect(within(excluded).getByText('Excluded')).toBeInTheDocument();
    expect(within(excluded).getByText('Potential gap')).toBeInTheDocument();
    expect(within(excluded).getByText('Verify with your insurer')).toBeInTheDocument();
    expect(within(excluded).getByText('Template')).toBeInTheDocument();
    expect(within(excluded).getByText('What you can do')).toBeInTheDocument();
    // Evidence shows the policy filename, not its id.
    expect(await within(excluded).findByText('sunrise-business-pack.pdf')).toBeInTheDocument();
    expect(within(excluded).getByText('Section 3 - Machinery')).toBeInTheDocument();

    const covered = findingCards().find((c) => c.textContent?.includes('Covered: Fire'))!;
    expect(within(covered).queryByText('Potential gap')).not.toBeInTheDocument();
    expect(within(covered).queryByText('Verify with your insurer')).not.toBeInTheDocument();

    const aiWritten = findingCards().filter((c) => within(c).queryByText('AI-written'));
    expect(aiWritten).toHaveLength(allStatusesAnalysis.report!.metadata.llm_findings);
    expect(aiWritten.length).toBeGreaterThan(0);
    const model = allStatusesAnalysis.report!.metadata.llm_model!;
    expect(within(aiWritten[0]).getByTitle(new RegExp(model))).toBeInTheDocument();

    expect(screen.getAllByText(FLAGGED_MESSAGE).length).toBeGreaterThan(0);
  });
});

describe('partial result', () => {
  it('opens on the coverage tab with a banner, and the report tab explains why it is empty', async () => {
    const { user } = await openResults(partialAnalysis.request_id);

    expect(screen.getByText('Partial – no written report')).toBeInTheDocument();
    expect(screen.getByText(/No AI model was used/)).toBeInTheDocument();
    expect(screen.getByText('The written report is not available')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Coverage' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('table')).toBeInTheDocument();
    // The gateway's own warning is shown.
    expect(screen.getByText(partialAnalysis.warnings[0])).toBeInTheDocument();
    // Without a report, the headline and counts come from the coverage results.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '14 risks checked, 14 potential gaps.',
    );

    await user.click(screen.getByRole('tab', { name: /Report/ }));
    expect(
      within(screen.getByRole('tabpanel')).getByText(/The written report could not be generated/),
    ).toBeInTheDocument();
  });
});

describe('coverage tab', () => {
  it('filters by status and by gaps, and expands a row to show its evidence', async () => {
    const { user } = await openResults(allStatusesAnalysis.request_id, '?tab=coverage');
    const table = screen.getByRole('table');
    const bodyRows = () => within(table).getAllByRole('row').slice(1);

    expect(bodyRows()).toHaveLength(14);
    expect(screen.getByText('Showing 14 of 14 risks')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'excluded');
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('Equipment breakdown');

    await user.selectOptions(screen.getByLabelText('Status'), 'all');
    await user.click(screen.getByLabelText('Potential gaps only'));
    expect(screen.getByText('Showing 13 of 14 risks')).toBeInTheDocument();

    const toggle = within(table).getByRole('button', { name: /Equipment breakdown/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(table).getByText(/Breakdown of ovens, refrigerators/)).toBeInTheDocument();
  });

  it('offers every status in the filter, with counts', async () => {
    await openResults(allStatusesAnalysis.request_id, '?tab=coverage');
    const options = within(screen.getByLabelText('Status'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual([
      'All statuses (14)',
      ...COVERAGE_STATUSES.map((s) => {
        const n = allStatusesAnalysis.coverage.assessments.filter((a) => a.status === s).length;
        return `${STATUS_LABELS[s]} (${n})`;
      }),
    ]);
    expect(screen.getAllByText('Rules').length).toBeGreaterThan(0);
  });
});

describe('risk profile tab and tabs', () => {
  it('groups risks by category with their source, confidence and inputs', async () => {
    await openResults(bakery.request_id, '?tab=risks');

    const risks = bakery.risk_profile.risks;
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(risks.length);
    expect(screen.getByRole('heading', { name: /^Equipment \(\d+\)$/ })).toBeInTheDocument();
    expect(screen.getByText(bakery.risk_profile.warnings[0].message)).toBeInTheDocument();
    expect(screen.getAllByRole('list', { name: 'Based on' }).length).toBeGreaterThan(0);
  });

  it('keeps the tab in the URL and moves between tabs with the arrow keys', async () => {
    const { user } = await openResults(bakery.request_id);

    screen.getByRole('tab', { name: 'Report' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Coverage' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Coverage' })).toHaveFocus();
    expect(location()).toBe(`/app/analyses/${bakery.request_id}?tab=coverage`);

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Risk profile' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
