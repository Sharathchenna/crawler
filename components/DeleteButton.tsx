"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Called only after the user confirms. */
  onDelete: () => void | Promise<void>;
  /** Used for aria-labels, e.g. the item title. */
  label: string;
  className?: string;
};

/**
 * Two-click delete: first click arms ("Sure?"), second confirms.
 * Disarms after 3s. Styled for ghost-button rows; red only when armed.
 */
export function DeleteButton({ onDelete, label, className = "" }: Props) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function handleClick() {
    if (!armed) {
      setArmed(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmed(false), 3000);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setArmed(false);
    await onDelete();
  }

  return (
    <button
      onClick={handleClick}
      aria-label={armed ? `Confirm delete ${label}` : `Delete ${label}`}
      className={
        armed
          ? "rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--red)] hover:bg-[var(--bg-active)]"
          : `rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-active)] hover:text-[var(--text-body)] ${className}`
      }
    >
      {armed ? "Sure?" : "Delete"}
    </button>
  );
}
