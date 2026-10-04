import { render, screen } from '@testing-library/react';
import { StatusBar } from './StatusBar';

describe('StatusBar', () => {
  it('describes the segments in words and lists every status with a count', () => {
    render(
      <StatusBar counts={{ covered: 2, conditional: 1, unclear: 0, excluded: 1, not_found: 3 }} />,
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Coverage results: 3 not found in your policies, 1 excluded, 1 covered with conditions, 2 covered.',
    );
    const legend = screen.getByRole('list', { name: 'Findings by status' });
    expect(legend).toHaveTextContent('Not found in your policies3');
    expect(legend).not.toHaveTextContent('Unclear');
  });
});
