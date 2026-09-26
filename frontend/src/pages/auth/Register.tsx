import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GENERIC_ERROR_MESSAGE, isApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { fieldErrorsFrom } from '../../lib/formErrors';
import { AuthCard } from './AuthCard';

// Same rules as RegisterRequest in shared/schemas/requests.py.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const FIELDS = ['email', 'password'] as const;

function validate(email: string, password: string, confirm: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    errors.password = 'This password is too long.';
  }
  if (confirm !== password) errors.confirm = 'The passwords do not match.';
  return errors;
}

export default function Register() {
  const { register } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors = validate(email, password, confirm);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      // Registers and logs in; <PublicOnly> then opens the app.
      await register(email.trim(), password);
    } catch (err) {
      setSubmitting(false);
      if (!isApiError(err)) {
        setFormError(GENERIC_ERROR_MESSAGE);
      } else if (err.status === 409) {
        setFieldErrors({ email: err.message });
      } else if (err.status === 422) {
        const { fields, other } = fieldErrorsFrom(err.details, FIELDS);
        setFieldErrors(fields);
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
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fieldErrors.confirm}
        />
        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
