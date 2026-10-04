import { useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GENERIC_ERROR_MESSAGE, isApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { WarningIcon } from '../../components/icons';
import { PasswordStrength } from '../../components/PasswordStrength';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { PasswordField } from '../../components/ui/PasswordField';
import { TextField } from '../../components/ui/TextField';
import { CONSENT_VERSION } from '../../lib/consent';
import { fieldErrorsFrom } from '../../lib/formErrors';
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, passwordBytes } from '../../lib/password';
import { AuthCard } from './AuthCard';

// Same rules as RegisterRequest in shared/schemas/requests.py.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FIELDS = ['email', 'password', 'consent_version'] as const;

function validate(
  email: string,
  password: string,
  confirm: string,
  consent: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (passwordBytes(password) > MAX_PASSWORD_BYTES) {
    errors.password = 'This password is too long.';
  }
  if (confirm !== password) errors.confirm = 'The passwords do not match.';
  if (!consent) errors.consent = 'Please agree to the privacy and data processing notice.';
  return errors;
}

export default function Register() {
  const { register } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const strengthId = useId();
  const consentErrorId = useId();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors = validate(email, password, confirm, consent);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      // Registers and logs in; <PublicOnly> then opens the app.
      await register(email.trim(), password, CONSENT_VERSION);
    } catch (err) {
      setSubmitting(false);
      if (!isApiError(err)) {
        setFormError(GENERIC_ERROR_MESSAGE);
      } else if (err.status === 409) {
        setFieldErrors({ email: err.message });
      } else if (err.status === 422) {
        const { fields, other } = fieldErrorsFrom(err.details, FIELDS);
        // The server checks consent too (e.g. after the notice changed): show it at the box.
        const { consent_version: consentError, ...rest } = fields;
        setFieldErrors(consentError ? { ...rest, consent: consentError } : rest);
        setFormError(other[0] ?? null);
      } else {
        setFormError(err.message);
      }
    }
  };

  const nextParam = searchParams.get('next');
  const loginLink = nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : '/login';

  return (
    <AuthCard
      title="Create your account"
      subtitle="Start organising your business risks and insurance coverage."
      aside="Your first coverage check takes about five minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to={loginLink} className="font-semibold text-brand hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <div>
          <PasswordField
            label="Password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            aria-describedby={strengthId}
          />
          <PasswordStrength password={password} id={strengthId} />
        </div>
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fieldErrors.confirm}
        />

        <div>
          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-invalid={fieldErrors.consent ? true : undefined}
              aria-describedby={fieldErrors.consent ? consentErrorId : undefined}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <span>
              I agree to the{' '}
              <Link
                to="/privacy"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-brand hover:underline"
              >
                privacy and data processing notice
              </Link>
              , including how my policies are processed by AI.
            </span>
          </label>
          {fieldErrors.consent && (
            <p
              id={consentErrorId}
              className="mt-1.5 flex items-start gap-1 text-xs font-medium text-status-excluded"
            >
              <WarningIcon className="mt-px h-3.5 w-3.5 shrink-0" />
              {fieldErrors.consent}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
