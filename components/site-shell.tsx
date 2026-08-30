"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SidebarNav, SidebarNavFallback } from "@/components/site-sidebar";
import { SiteFooter } from "@/components/site-footer";

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 stroke-current"
      fill="none"
      strokeWidth="1.75"
    >
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-rule bg-paper-deep/50 px-5 py-8 lg:block">
        <Suspense fallback={<SidebarNavFallback />}>
          <SidebarNav />
        </Suspense>
      </aside>

      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-rule bg-paper/90 px-5 py-4 backdrop-blur-sm lg:hidden">
          <Link href="/" className="text-lg font-semibold tracking-tight text-ink no-underline">
            Parchment
          </Link>
          <button
            type="button"
            className="text-ink"
            aria-expanded={open}
            aria-controls="mobile-sidebar"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <MenuIcon open={open} />
          </button>
        </header>

        {open ? (
          <div className="fixed inset-0 z-30 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-ink/25"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            />
            <aside
              id="mobile-sidebar"
              className="relative h-full w-64 max-w-[85vw] overflow-y-auto bg-paper px-5 py-8 shadow-lg"
            >
              <Suspense fallback={<SidebarNavFallback onNavigate={() => setOpen(false)} />}>
                <SidebarNav onNavigate={() => setOpen(false)} />
              </Suspense>
            </aside>
          </div>
        ) : null}

        {children}
        <SiteFooter />
      </div>
    </div>
  );
}
