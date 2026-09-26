import { screen } from '@testing-library/react';
import { renderApp } from './test/renderApp';

describe('routes', () => {
  it('shows the landing page at /', () => {
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Discover your coverage gaps',
    );
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/register');
  });

  it('shows a not-found page for an unknown URL', () => {
    renderApp('/no-such-page');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
