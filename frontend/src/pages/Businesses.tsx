import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MAX_BUSINESS_PROFILES,
  useBusinessProfiles,
  useDeleteBusinessProfile,
} from '../api/businessProfiles';
import type { SavedBusinessProfile } from '../api/types';
import { ErrorMessage } from '../components/ErrorMessage';
import { Button } from '../components/ui/Button';
import { buttonClasses } from '../components/ui/buttonClasses';
import { PageHeader } from '../components/ui/PageHeader';
import { SkeletonList } from '../components/ui/Skeleton';
import { formatDateTime } from '../lib/format';
import { analysisFlowPath, businessTypeLabel, profileFormPath } from '../lib/profile';

export default function Businesses() {
  const profiles = useBusinessProfiles();
  const atLimit = (profiles.data?.length ?? 0) >= MAX_BUSINESS_PROFILES;

  return (
    <section>
      <PageHeader
        eyebrow="Business workspace"
        title="Businesses"
        description="The businesses saved to your account. Pick one when you start a new analysis, or keep them up to date here."
        action={
          profiles.data && profiles.data.length > 0 && !atLimit ? (
            <Link to={profileFormPath()} className={buttonClasses('primary')}>
              Add a business
            </Link>
          ) : undefined
        }
      />
      {profiles.isPending ? (
        <SkeletonList label="Loading your businesses" rows={2} />
      ) : profiles.isError ? (
        <ErrorMessage
          title="Your businesses could not be loaded"
          error={profiles.error}
          onRetry={() => void profiles.refetch()}
        />
      ) : profiles.data.length === 0 ? (
        <div className="max-w-2xl rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 font-bold text-blue-700">
            BU
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-950">No business profile yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Add your business details once. They are saved to your account and can be picked for
            every analysis.
          </p>
          <Link to={profileFormPath()} className={`mt-5 ${buttonClasses('primary')}`}>
            Add business profile
          </Link>
        </div>
      ) : (
        <>
          <ul className="grid max-w-5xl gap-5 lg:grid-cols-2" aria-label="Your businesses">
            {profiles.data.map((saved) => (
              <BusinessCard key={saved.profile_id} saved={saved} />
            ))}
          </ul>
          {atLimit && (
            <p className="mt-5 text-sm text-slate-500">
              You have saved {MAX_BUSINESS_PROFILES} businesses, the most one account can keep.
              Delete one to add another.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function BusinessCard({ saved }: { saved: SavedBusinessProfile }) {
  const remove = useDeleteBusinessProfile();
  const [confirming, setConfirming] = useState(false);
  const { profile } = saved;
  // "Kandy, Kandy, Sri Lanka" reads as a mistake: a district named like its city is shown once.
  const location = [
    ...new Set(
      [profile.location?.city, profile.location?.district, profile.location?.country].filter(
        Boolean,
      ),
    ),
  ].join(', ');
  const headingId = `business-${saved.profile_id}`;

  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">
        {businessTypeLabel(profile)}
      </p>
      <h2 id={headingId} className="mt-2 text-xl font-extrabold text-slate-950">
        {profile.business_name}
      </h2>
      <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
        <Info
          label="Employees"
          value={profile.employee_count == null ? 'Not provided' : String(profile.employee_count)}
        />
        <Info label="Location" value={location || 'Not provided'} />
        <Info
          label="Equipment"
          value={profile.equipment?.length ? profile.equipment.join(', ') : 'Not provided'}
        />
        <Info label="Last updated" value={formatDateTime(saved.updated_at)} />
      </dl>

      {remove.isError && (
        <div className="mt-5">
          <ErrorMessage title="The business could not be deleted" error={remove.error} />
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
        {confirming ? (
          <div
            role="group"
            aria-label={`Delete ${profile.business_name}?`}
            className="flex flex-wrap items-center gap-3"
          >
            <span className="text-sm font-semibold text-slate-800">
              Delete {profile.business_name}? Past analyses are kept.
            </span>
            <Button
              variant="secondary"
              size="sm"
              loading={remove.isPending}
              onClick={() => remove.mutate(saved.profile_id)}
            >
              Yes, delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <>
            <Link
              to={analysisFlowPath(saved.profile_id, 'policies')}
              className={buttonClasses('ai')}
            >
              Analyse this business →
            </Link>
            <Link
              to={profileFormPath(saved.profile_id)}
              className={buttonClasses('secondary')}
              aria-label={`Edit ${profile.business_name}`}
            >
              Edit
            </Link>
            <Button
              variant="ghost"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${profile.business_name}`}
            >
              Delete
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}
