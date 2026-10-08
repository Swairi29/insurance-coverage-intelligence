import { screen } from '@testing-library/react';
import { renderApp } from './test/renderApp';
import { loginAsDemoUser } from './test/session';

describe('landing page', () => {
  it('shows the hero, the four agents, an example finding, responsible AI and pricing', () => {
    renderApp('/');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Know what your insurance actually covers.',
    );
    expect(screen.getByRole('link', { name: 'Start free assessment →' })).toHaveAttribute(
      'href',
      '/register',
    );
    // The trust row and the agent workspace preview.
    expect(screen.getByText('Every finding cites the policy clause')).toBeInTheDocument();
    expect(screen.getByText('The gateway calls each agent in turn.')).toBeInTheDocument();

    const how = screen.getByRole('heading', { name: 'How the four agents work together' });
    expect(how).toBeInTheDocument();
    expect(screen.getByText(/Agents never call each other/)).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: 'Every finding shows its evidence' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Breakdown of ovens, refrigerators and other machinery is excluded/),
    ).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Built responsibly' })).toBeInTheDocument();
    for (const name of ['Fairness', 'Transparency', 'Privacy', 'Human oversight']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }

    const pricing = screen.getByRole('heading', { name: 'Plans for every size of business' });
    expect(pricing).toBeInTheDocument();
    for (const tier of ['Free', 'Starter', 'Business', 'Broker']) {
      expect(screen.getByRole('heading', { name: tier })).toBeInTheDocument();
    }
    expect(screen.getByText('LKR 2,490')).toBeInTheDocument();
    expect(screen.getByText(/takes no\s+payments/)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Privacy & consent' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(
      screen.getByText(/does not provide legal, financial or\s+insurance advice/),
    ).toBeInTheDocument();
  });

  it('points a logged-in user to the dashboard', async () => {
    loginAsDemoUser();
    renderApp('/');

    expect(await screen.findByRole('link', { name: 'Open your dashboard' })).toHaveAttribute(
      'href',
      '/app',
    );
    expect(screen.queryByRole('link', { name: 'Get started' })).not.toBeInTheDocument();
  });
});

describe('routes', () => {
  it('shows the privacy and consent notice', () => {
    renderApp('/privacy');
    expect(
      screen.getByRole('heading', { name: 'How InsureIntel uses your data' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your business name is never sent to the AI/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Responsible AI notes' })).toHaveAttribute(
      'href',
      '/responsible-ai',
    );
  });

  it('shows the Responsible AI notes in the app, linked from the landing page', async () => {
    const { user } = renderApp('/');
    const link = screen.getByRole('link', { name: 'Read the full Responsible AI notes →' });
    expect(link).toHaveAttribute('href', '/responsible-ai');
    expect(link).not.toHaveAttribute('target');

    await user.click(link);

    expect(
      await screen.findByRole('heading', { name: 'How InsureIntel uses AI, and its limits' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Where AI is used' })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Hidden instructions in documents' }),
    ).toHaveTextContent('never sent to the AI that writes your report');
    expect(screen.getByRole('link', { name: 'privacy and consent notice' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('shows a not-found page for an unknown URL', () => {
    renderApp('/no-such-page');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
