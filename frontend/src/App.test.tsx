import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the brand name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('InsureIntel');
  });
});
