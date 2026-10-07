import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { businessTypeLabel, loadProfileDraft } from '../lib/profile';

export default function Businesses() {
  const profile = loadProfileDraft();
  const { user } = useAuth();
  const location = [
    profile?.location?.city,
    profile?.location?.district,
    profile?.location?.country,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <section>
      <PageHeader
        eyebrow="Business workspace"
        title="Businesses"
        description="Manage the business information used to create structured risk profiles."
        action={
          <Link to="/app/profile">
            <Button>{profile ? 'Edit business profile' : 'Add a business'}</Button>
          </Link>
        }
      />
      {profile ? (
        <article className="max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">
                Business profile
              </p>
              <h2 className="mt-2 text-2xl font-extrabold text-slate-950">
                {profile.business_name}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{businessTypeLabel(profile)}</p>
            </div>
            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              Current profile
            </span>
          </div>
          <dl className="mt-7 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
            <Info
              label="Employees"
              value={
                profile.employee_count == null ? 'Not provided' : String(profile.employee_count)
              }
            />
            <Info label="Location" value={location || 'Not provided'} />
            <Info
              label="Equipment"
              value={profile.equipment?.length ? profile.equipment.join(', ') : 'Not provided'}
            />
            <Info label="Account" value={user?.email ?? 'Signed in'} />
          </dl>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/app/profile">
              <Button variant="secondary">View or edit details</Button>
            </Link>
            <Link to="/app/analyses/new/profile">
              <Button variant="ai">Analyse this business →</Button>
            </Link>
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-500">
            Your saved business profile is kept in this browser session. Business profiles are not
            synced as separate records by the current service.
          </p>
        </article>
      ) : (
        <div className="max-w-2xl rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 font-bold text-blue-700">
            BU
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-950">No business profile yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Add your business details to use the structured profile analysis method.
          </p>
          <Link to="/app/profile" className="mt-5 inline-block">
            <Button>Add business profile</Button>
          </Link>
        </div>
      )}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}
