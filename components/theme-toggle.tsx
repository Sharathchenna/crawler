"use client";

import { useTheme } from "@/components/theme-provider";

const LABEL = {
  system: "System",
  light: "Light",
  dark: "Dark",
} as const;

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, cycle } = useTheme();
  return (
    <button
      type="button"
      onClick={cycle}
      className={`rounded-md text-left text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink ${
        compact ? "px-1 py-1" : "px-3 py-2 hover:bg-paper-deep"
      }`}
      aria-label={`Color theme: ${LABEL[preference]}. Click to change.`}
    >
      {compact ? LABEL[preference] : `Theme · ${LABEL[preference]}`}
    </button>
  );
}
