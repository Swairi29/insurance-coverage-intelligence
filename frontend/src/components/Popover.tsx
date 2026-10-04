import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * A button that opens a small panel below it. Closes on Escape (focus returns to the button)
 * and on a click outside. Used for the service status and the user menu.
 */
export function Popover({
  trigger,
  triggerLabel,
  triggerClassName,
  title,
  align = 'right',
  children,
}: {
  trigger: ReactNode;
  /** Accessible name of the button, when its content is not enough. */
  triggerLabel?: string;
  triggerClassName: string;
  /** `title` attribute of the button (tooltip). */
  title?: string;
  align?: 'left' | 'right';
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={triggerLabel}
        title={title}
        onClick={() => setOpen((value) => !value)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={panelId}
          className={`absolute top-full z-40 mt-2 w-72 rounded-panel border border-line bg-white p-3 shadow-lift ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
