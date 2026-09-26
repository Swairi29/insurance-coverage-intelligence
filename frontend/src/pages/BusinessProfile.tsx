import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type Path } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ValidationErrorDetail } from '../api/types';
import { BUSINESS_TYPES, SALES_CHANNELS } from '../api/types';
import { TagInput } from '../components/form/TagInput';
import { TriStateField } from '../components/form/TriStateField';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { INPUT_CLASSES, inputBorder } from '../components/ui/fieldStyles';
import { TextArea, TextField } from '../components/ui/TextField';
import {
  BUSINESS_TYPE_LABELS,
  EMPTY_PROFILE_FORM,
  PROFILE_LIMITS as LIMITS,
  SALES_CHANNEL_LABELS,
  YES_NO_QUESTIONS,
  loadProfileDraft,
  profileErrorsFrom,
  saveProfileDraft,
  toBusinessProfile,
  toFormValues,
  type ProfileFormValues,
} from '../lib/profile';

/** Navigation state: step 9 sends the user back here with a 422's details. */
export interface ProfilePageState {
  serverErrors?: ValidationErrorDetail[];
  /** Why the user was sent here, e.g. from the new-analysis page without a profile. */
  notice?: string;
}

export default function BusinessProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [draft] = useState(loadProfileDraft);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    defaultValues: draft ? toFormValues(draft) : EMPTY_PROFILE_FORM,
    mode: 'onTouched',
  });

  // Show the errors the gateway found when an analysis was started with this profile.
  const pageState = location.state as ProfilePageState | null;
  const serverErrors = pageState?.serverErrors;
  const serverMapped = useMemo(
    () => (serverErrors?.length ? profileErrorsFrom(serverErrors) : null),
    [serverErrors],
  );
  // Messages for things that are not form fields (e.g. policy_ids) are listed at the top.
  const otherServerErrors = serverMapped?.other ?? [];
  useEffect(() => {
    if (!serverMapped) return;
    // Focus only the first field: moving focus on would "blur" it, and blur re-validates the
    // field in the browser, which would clear the server's message again.
    Object.entries(serverMapped.fields).forEach(([name, message], index) => {
      setError(
        name as Path<ProfileFormValues>,
        { type: 'server', message },
        { shouldFocus: index === 0 },
      );
    });
  }, [serverMapped, setError]);

  const onSubmit = (values: ProfileFormValues) => {
    saveProfileDraft(toBusinessProfile(values));
    navigate('/app/policies');
  };

  const descriptionLength = useWatch({ control, name: 'description' }).length;
  const errorCount = Object.keys(errors).length;

  return (
    <section className="max-w-3xl">
      <h1 className="text-2xl font-extrabold">Business profile</h1>
      <p className="mt-2 text-sm text-muted">
        Tell us about the business. The more you fill in, the more specific the risk check is. Only
        the name and type are required. The profile is kept in this browser tab and sent with each
        analysis; it is cleared when you log out.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-6">
        {pageState?.notice && <Alert tone="info">{pageState.notice}</Alert>}
        {(errorCount > 0 || otherServerErrors.length > 0) && (
          <Alert tone="error" title="Please check the highlighted fields">
            {otherServerErrors.length > 0 && (
              <ul className="list-disc pl-5">
                {otherServerErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}

        <Card title="About the business">
          <TextField
            label="Business name"
            required
            autoComplete="organization"
            error={errors.business_name?.message}
            {...register('business_name', {
              validate: (v) => v.trim().length > 0 || 'Enter the business name.',
              maxLength: {
                value: LIMITS.nameLength,
                message: `Use at most ${LIMITS.nameLength} characters.`,
              },
            })}
          />

          <SelectField
            label="Type of business"
            required
            error={errors.business_type?.message}
            hint="The risk checks currently support these three types."
          >
            {(props) => (
              <select
                {...props}
                {...register('business_type', { required: 'Choose the type of business.' })}
              >
                <option value="">Choose…</option>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {BUSINESS_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            )}
          </SelectField>

          <TextArea
            label="What does the business do?"
            hint={`${descriptionLength} / ${LIMITS.descriptionLength} characters. For example: products, opening hours, anything risky.`}
            error={errors.description?.message}
            {...register('description', {
              maxLength: {
                value: LIMITS.descriptionLength,
                message: `Use at most ${LIMITS.descriptionLength} characters.`,
              },
            })}
          />

          <TextField
            label="Number of employees"
            inputMode="numeric"
            className="sm:max-w-xs"
            error={errors.employee_count?.message}
            {...register('employee_count', {
              validate: (v) => {
                const text = v.trim();
                if (!text) return true;
                if (!/^\d+$/.test(text)) return 'Enter a whole number.';
                return (
                  Number(text) <= LIMITS.maxEmployees ||
                  `This tool is for businesses with up to ${LIMITS.maxEmployees} employees.`
                );
              },
            })}
          />

          <Controller
            control={control}
            name="equipment"
            render={({ field, fieldState }) => (
              <TagInput
                label="Equipment"
                value={field.value}
                onChange={field.onChange}
                maxItems={LIMITS.equipmentItems}
                maxLength={LIMITS.equipmentItemLength}
                error={fieldState.error?.message}
                hint="Main machines and systems, e.g. ovens, refrigerators, POS system. Press Enter after each."
                placeholder="e.g. Ovens"
              />
            )}
          />
        </Card>

        <Card title="How the business operates">
          <fieldset>
            <legend className="text-sm font-semibold text-ink-heading">How do you sell?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SALES_CHANNELS.map((channel) => (
                <label
                  key={channel}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand"
                >
                  <input
                    type="checkbox"
                    value={channel}
                    className="h-4 w-4 accent-brand"
                    {...register('operations.sales_channels')}
                  />
                  {SALES_CHANNEL_LABELS[channel]}
                </label>
              ))}
            </div>
            {errors.operations?.sales_channels && (
              <p className="mt-1 text-xs font-medium text-status-excluded">
                {errors.operations.sales_channels.message}
              </p>
            )}
          </fieldset>

          {YES_NO_QUESTIONS.map((question) => (
            <TriStateField
              key={question.name}
              legend={question.label}
              registration={register(`operations.${question.name}`)}
              error={errors.operations?.[question.name]?.message}
            />
          ))}
        </Card>

        <Card title="Location">
          <div className="grid gap-4 sm:grid-cols-3">
            {(['city', 'district', 'country'] as const).map((place) => (
              <TextField
                key={place}
                label={place[0].toUpperCase() + place.slice(1)}
                error={errors.location?.[place]?.message}
                {...register(`location.${place}`, {
                  maxLength: {
                    value: LIMITS.placeLength,
                    message: `Use at most ${LIMITS.placeLength} characters.`,
                  },
                })}
              />
            ))}
          </div>
          <TriStateField
            legend="Is the business in a flood-prone area?"
            registration={register('location.flood_prone_area')}
            error={errors.location?.flood_prone_area?.message}
          />
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={isSubmitting}>
            Save and continue to policies
          </Button>
          {draft && <span className="text-xs text-muted">A saved profile was loaded.</span>}
        </div>
      </form>
    </section>
  );
}

/** A titled group of fields. Every field inside has its own label, so no fieldset is needed. */
function Card({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-5 rounded-card border border-line bg-white p-5 sm:p-6"
    >
      <h2 id={headingId} className="text-lg font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A labelled <select> with the same look and error wiring as TextField. */
function SelectField({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    className: string;
    'aria-invalid'?: boolean;
    'aria-required'?: boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}) {
  const id = 'business-type';
  return (
    <div className="sm:max-w-xs">
      <label htmlFor={id} className="block text-sm font-semibold text-ink-heading">
        {label}
        {required && (
          <span className="text-status-excluded" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children({
        id,
        className: `${INPUT_CLASSES} ${inputBorder(error)}`,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
        'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
      })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-status-excluded">
          {error}
        </p>
      )}
    </div>
  );
}
