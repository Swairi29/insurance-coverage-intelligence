import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Brand />
      <h1 className="mt-4 text-3xl font-extrabold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">
        The page you were looking for does not exist or has moved.
      </p>
      <Link
        to="/"
        className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        Go to the home page
      </Link>
    </main>
  );
}
