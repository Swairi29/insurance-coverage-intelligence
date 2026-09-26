import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GENERIC_ERROR_MESSAGE, isApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { fieldErrorsFrom, formatWait } from '../../lib/formErrors';
import { AuthCard } from './AuthCard';

const FIELDS = ['email', 'password'] as const;

export default function Login() {
  const { login, sessionExpired } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Count down a 429 lockout, then enable the button again.
  useEffect(() => {
    if (lockedUntil === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        setLockedUntil(null);
        setFormError(null);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  const secondsLeft = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const missing: Record<string, string> = {};
    if (!email.trim()) missing.email = 'Enter your email.';
    if (!password) missing.password = 'Enter your password.';
    setFieldErrors(missing);
    setFormError(null);
    if (Object.keys(missing).length) return;

    setSubmitting(true);
    try {
      // On success the auth state changes and <PublicOnly> opens the requested page.
      await login(email.trim(), password);
    } catch (err) {
      setSubmitting(false);
      if (!isApiError(err)) {
        setFormError(GENERIC_ERROR_MESSAGE);
        return;
      }
      if (err.status === 429) {
        const wait = err.retryAfter ?? 60;
        setNow(Date.now());
        setLockedUntil(Date.now() + wait * 1000);
      }
      if (err.status === 422) {
        const { fields, other } = fieldErrorsFrom(err.details, FIELDS);
        setFieldErrors(fields);
        setFormError(other[0] ?? null);
        return;
      }
      setFormError(err.message);
    }
  };

  const nextParam = searchParams.get('next');
  const registerLink = nextParam ? `/register?next=${encodeURIComponent(nextParam)}` : '/register';

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to see your business risks and insurance coverage."
      footer={
        <>
          New to InsureIntel?{' '}
          <Link to={registerLink} className="font-semibold text-brand hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {sessionExpired && !formError && (
          <Alert tone="info">Your session has expired. Please log in again.</Alert>
        )}
        {formError && (
          <Alert tone="error">
            {formError}
            {secondsLeft > 0 && (
              <span className="mt-1 block">You can try again in {formatWait(secondsLeft)}.</span>
            )}
          </Alert>
        )}
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <Button type="submit" className="w-full" loading={submitting} disabled={secondsLeft > 0}>
          Log in
        </Button>
      </form>
    </AuthCard>
  );
}
