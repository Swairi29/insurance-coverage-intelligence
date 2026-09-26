import { render, screen } from '@testing-library/react';
import { confidenceLevel } from '../lib/labels';
import { ConfidenceLabel } from './ConfidenceLabel';

describe('confidenceLevel', () => {
  it.each([
    [1, 'High'],
    [0.75, 'High'],
    [0.74, 'Medium'],
    [0.5, 'Medium'],
    [0.49, 'Low'],
    [0, 'Low'],
  ] as const)('%s -> %s', (value, level) => {
    expect(confidenceLevel(value)).toBe(level);
  });
});

describe('ConfidenceLabel', () => {
  it('shows a word, with the number only in the tooltip', () => {
    render(<ConfidenceLabel value={0.95} />);
    const label = screen.getByText(/High confidence/);
    expect(label).toHaveAttribute('title', expect.stringContaining('0.95'));
    expect(label).not.toHaveTextContent('%');
  });

  it.each([
    [0.6, 'Medium confidence'],
    [0.2, 'Low confidence'],
  ])('shows %s as %s', (value, text) => {
    render(<ConfidenceLabel value={value} />);
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
  });
});
