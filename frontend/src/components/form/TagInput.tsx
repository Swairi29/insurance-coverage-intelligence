import { useId, useState, type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { INPUT_CLASSES, inputBorder } from '../ui/fieldStyles';

/**
 * A list of short text items (e.g. equipment). Type an item and press Enter, a comma or
 * "Add". Blank items and case-insensitive duplicates are ignored, like the backend does.
 */
export function TagInput({
  label,
  value,
  onChange,
  maxItems,
  maxLength,
  error,
  hint,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (items: string[]) => void;
  maxItems: number;
  maxLength: number;
  error?: string | null;
  hint?: string;
  placeholder?: string;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = localError ?? error ?? null;

  const add = () => {
    const item = draft.replace(/\s+/g, ' ').trim();
    if (!item) return;
    if (item.length > maxLength) {
      setLocalError(`Each item can be at most ${maxLength} characters.`);
      return;
    }
    if (value.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
      setLocalError(`"${item}" is already in the list.`);
      return;
    }
    if (value.length >= maxItems) {
      setLocalError(`You can add at most ${maxItems} items.`);
      return;
    }
    onChange([...value, item]);
    setDraft('');
    setLocalError(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault(); // Enter would submit the whole form
      add();
    } else if (event.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const describedBy = shownError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-semibold text-ink-heading">
        {label}
      </label>
      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label={`${label} added`}>
          {value.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1 rounded-full border border-brand-border bg-brand-soft py-1 pl-3 pr-1 text-sm text-ink-heading"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(value.filter((existing) => existing !== item))}
                aria-label={`Remove ${item}`}
                className="rounded-full px-1.5 text-muted hover:bg-white hover:text-status-excluded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-start gap-2">
        <input
          id={inputId}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setLocalError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          maxLength={maxLength + 20}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={describedBy}
          className={`${INPUT_CLASSES} ${inputBorder(shownError)}`}
        />
        <Button variant="secondary" onClick={add} className="mt-1.5 shrink-0">
          Add
        </Button>
      </div>
      {hint && !shownError && (
        <p id={`${inputId}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {shownError && (
        <p id={`${inputId}-error`} className="mt-1 text-xs font-medium text-status-excluded">
          {shownError}
        </p>
      )}
    </div>
  );
}
