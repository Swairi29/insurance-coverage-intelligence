import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, GENERIC_ERROR_MESSAGE } from '../api/client';
import { DEFAULT_DISCLAIMER, Disclaimer } from './Disclaimer';
import { ErrorMessage } from './ErrorMessage';

describe('ErrorMessage', () => {
  it('shows the gateway message, the failed step and the reference', () => {
    const error = new ApiError({
      status: 504,
      error: 'agent_timeout',
      message: 'An analysis service took too long to respond. Please try again.',
      stage: 'coverage',
      requestId: 'abc123',
    });
    render(<ErrorMessage error={error} title="The analysis could not finish" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The analysis could not finish');
    expect(alert).toHaveTextContent('took too long to respond');
    expect(alert).toHaveTextContent('The problem happened at this step: Coverage analysis.');
    expect(alert).toHaveTextContent('Reference: abc123');
    expect(alert).not.toHaveTextContent('agent_timeout');
  });

  it('lists 422 details', () => {
    const error = new ApiError({
      status: 422,
      error: 'validation_error',
      message: 'The request could not be processed because some input was invalid.',
      details: [{ field: 'policy_ids', message: 'List should have between 1 and 5 items' }],
    });
    render(<ErrorMessage error={error} />);

    expect(screen.getByRole('listitem')).toHaveTextContent(
      'List should have between 1 and 5 items',
    );
  });

  it('shows a generic message for anything that is not an ApiError', () => {
    render(<ErrorMessage error={new TypeError('x is undefined at line 42')} />);

    expect(screen.getByRole('alert')).toHaveTextContent(GENERIC_ERROR_MESSAGE);
    expect(screen.getByRole('alert')).not.toHaveTextContent('line 42');
  });

  it('offers a retry when given one', async () => {
    const onRetry = vi.fn();
    render(<ErrorMessage error={null} onRetry={onRetry} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('Disclaimer', () => {
  it('shows the default wording', () => {
    render(<Disclaimer />);
    const aside = screen.getByRole('complementary', { name: 'Disclaimer' });
    expect(aside).toHaveTextContent('Decision support, not advice.');
    expect(aside).toHaveTextContent(DEFAULT_DISCLAIMER);
  });

  it('shows the report’s own disclaimer when given', () => {
    render(<Disclaimer text="Confirm with your broker." />);
    expect(screen.getByText(/Confirm with your broker\./)).toBeInTheDocument();
  });
});
