import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <section className="max-w-3xl">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Account and privacy information for your InsureIntel workspace."
      />
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-950">Account</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Email</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Business account ID
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">{user?.business_id}</dd>
            </div>
          </dl>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-950">Responsible use</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            InsureIntel provides decision support based on uploaded policy wording. Findings are not
            legal advice or a binding coverage decision. Confirm coverage with your insurer or
            broker.
          </p>
          <Link
            to="/privacy"
            className="mt-3 inline-block text-sm font-bold text-blue-700 hover:underline"
          >
            Read privacy and data processing information →
          </Link>
        </section>
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-100 bg-white p-6">
          <div>
            <h2 className="font-bold text-slate-950">Sign out</h2>
            <p className="mt-1 text-sm text-slate-500">
              End this authenticated session on this device.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
          >
            Log out
          </Button>
        </section>
      </div>
    </section>
  );
}
