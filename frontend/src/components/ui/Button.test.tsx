import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('uses indigo for AI actions and navy for ordinary ones', () => {
    render(
      <>
        <Button variant="ai">Run analysis</Button>
        <Button>Save</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Run analysis' })).toHaveClass('bg-ai');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('bg-brand');
  });

  it('takes padding from size only, so it is never two conflicting classes', () => {
    render(<Button size="sm">Log out</Button>);
    const button = screen.getByRole('button', { name: 'Log out' });
    expect(button).toHaveClass('px-3', 'py-1.5');
    expect(button).not.toHaveClass('px-4');
  });

  it('draws the loading spinner in the button text colour', () => {
    render(<Button loading>Save</Button>);
    const spinner = screen.getByRole('button').querySelector('svg');
    expect(spinner).toHaveClass('text-current');
    expect(spinner).not.toHaveClass('text-brand');
  });
});
