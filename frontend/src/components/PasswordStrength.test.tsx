import { render, screen } from '@testing-library/react';
import { passwordStrength } from '../lib/password';
import { PasswordStrength } from './PasswordStrength';

describe('password strength', () => {
  it.each([
    ['', 0],
    ['short', 0],
    ['eight888', 1],
    ['twelve-chars', 2],
    ['sixteen-chars-ok', 3],
  ] as const)('%s -> level %i (length only, like the backend)', (password, level) => {
    expect(passwordStrength(password)).toBe(level);
  });

  it('shows the strength in words and ticks the rules the backend enforces', () => {
    render(<PasswordStrength password="correct horse battery" />);
    expect(screen.getByText('Strength: Strong')).toBeInTheDocument();
    const rules = screen.getByRole('list', { name: 'Password rules' });
    expect(rules).toHaveTextContent('At least 8 characters (met)');
    expect(rules).toHaveTextContent(/At most 72 bytes.*\(met\)/);
    // No symbol or number rules: the backend does not require them.
    expect(rules).not.toHaveTextContent(/symbol|number/i);
  });

  it('says a short password is too short', () => {
    render(<PasswordStrength password="abc" />);
    expect(screen.getByText('Strength: Too short')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Password rules' })).toHaveTextContent(
      'At least 8 characters (not met yet)',
    );
  });
});
