import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  passwordBytes,
  passwordStrength,
  type StrengthLevel,
} from '../lib/password';
import { CheckIcon } from './icons';

const LEVELS: Record<StrengthLevel, { label: string; bar: string; text: string }> = {
  0: { label: 'Too short', bar: 'bg-status-excluded', text: 'text-status-excluded' },
  1: { label: 'Fair', bar: 'bg-status-conditional-dot', text: 'text-status-conditional' },
  2: { label: 'Good', bar: 'bg-status-covered-dot', text: 'text-status-covered' },
  3: { label: 'Strong', bar: 'bg-status-covered', text: 'text-status-covered' },
};

/** Strength in colour and words, plus the written rules with a tick for each one met. */
export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const level = passwordStrength(password);
  const { label, bar, text } = LEVELS[level];
  // Segments to fill: one red one for "too short", then one per level.
  const filled = password ? Math.max(level, 1) : 0;
  const rules = [
    {
      text: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: password.length >= MIN_PASSWORD_LENGTH,
    },
    {
      text: `At most ${MAX_PASSWORD_BYTES} bytes (about ${MAX_PASSWORD_BYTES} letters)`,
      met: password.length > 0 && passwordBytes(password) <= MAX_PASSWORD_BYTES,
    },
  ];

  return (
    <div id={id} className="mt-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={`h-1.5 flex-1 rounded-pill ${step <= filled ? bar : 'bg-line'}`}
            />
          ))}
        </div>
        {password && <span className={`text-xs font-semibold ${text}`}>Strength: {label}</span>}
      </div>
      <ul className="mt-2 space-y-0.5 text-xs" aria-label="Password rules">
        {rules.map((rule) => (
          <li
            key={rule.text}
            className={`flex items-center gap-1.5 ${rule.met ? 'text-status-covered' : 'text-muted'}`}
          >
            <CheckIcon className={`h-3.5 w-3.5 ${rule.met ? '' : 'opacity-30'}`} />
            {rule.text}
            <span className="sr-only">{rule.met ? ' (met)' : ' (not met yet)'}</span>
          </li>
        ))}
        <li className="text-muted">Longer is stronger: a short phrase is easy to remember.</li>
      </ul>
    </div>
  );
}
