import type { UseFormRegisterReturn } from 'react-hook-form';

const OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Not sure' },
] as const;

/** A Yes / No / Not sure question as a radio group. "Not sure" is sent as null. */
export function TriStateField({
  legend,
  registration,
  error,
}: {
  legend: string;
  registration: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink-heading">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40"
          >
            <input
              type="radio"
              value={option.value}
              className="h-4 w-4 accent-brand"
              {...registration}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs font-medium text-status-excluded">{error}</p>}
    </fieldset>
  );
}
