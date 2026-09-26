import { screen } from '@testing-library/react';
import { renderApp } from './test/renderApp';
import { loginAsDemoUser } from './test/session';

describe('landing page', () => {
  it('shows the hero, capabilities, workflow and responsible-AI note', () => {
    renderApp('/');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Discover your coverage gaps',
    );
    expect(screen.getByRole('link', { name: 'Start assessment →' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(screen.getByRole('heading', { name: 'Platform capabilities' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Risk profiling',
      'Policy intelligence',
      'Gap detection',
    ]);
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.getByText('Evidence-based report')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Responsible AI' })).toBeInTheDocument();
    expect(
      screen.getByText(/does not provide legal, financial or insurance advice/),
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
  it('shows a not-found page for an unknown URL', () => {
    renderApp('/no-such-page');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
