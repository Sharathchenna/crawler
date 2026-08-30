"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CONTENT_TYPE_LABELS, CONTENT_TYPES } from "@/shared/types";

function navClass(active: boolean) {
  return `block rounded-md px-3 py-2 text-sm no-underline transition-colors ${
    active
      ? "bg-terracotta/10 text-ink"
      : "text-muted hover:bg-paper-deep hover:text-ink"
  }`;
}

function searchHref(input: {
  origin?: string | null;
  type?: string | null;
  query?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.query) {
    params.set("q", input.query);
  }
  if (input.origin) {
    params.set("origin", input.origin);
  }
  if (input.type) {
    params.set("type", input.type);
  }
  const query = params.toString();
  return query ? `/search?${query}` : "/search";
}

function SidebarBody({
  pathname,
  activeType,
  activeOrigin,
  query,
  onNavigate,
}: {
  pathname: string;
  activeType: string | null;
  activeOrigin: string | null;
  query?: string | null;
  onNavigate?: () => void;
}) {
  const onSearch = pathname === "/search";

  return (
    <div className="flex h-full flex-col">
      <Link href="/" className="block no-underline" onClick={onNavigate}>
        <span className="block text-xl font-semibold tracking-tight text-ink">
          Parchment
        </span>
        <span className="mt-1 block text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted">
          Link library
        </span>
      </Link>

      <p className="mt-10 mb-2 px-3 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted">
        Library
      </p>
      <nav className="flex flex-col gap-0.5" aria-label="Library">
        <Link href="/" className={navClass(pathname === "/")} onClick={onNavigate}>
          Index
        </Link>
        <Link
          href="/search?origin=saved"
          className={navClass(onSearch && activeOrigin === "saved")}
          onClick={onNavigate}
        >
          Yours
        </Link>
        <Link
          href="/search?origin=suggested"
          className={navClass(onSearch && activeOrigin === "suggested")}
          onClick={onNavigate}
        >
          Suggested
        </Link>
        <Link
          href="/search"
          className={navClass(onSearch && !activeOrigin && !activeType)}
          onClick={onNavigate}
        >
          Search
        </Link>
        <Link
          href="/about"
          className={navClass(pathname.startsWith("/about"))}
          onClick={onNavigate}
        >
          About
        </Link>
      </nav>

      <p className="mt-10 mb-2 px-3 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted">
        Shelves
      </p>
      <nav className="flex flex-col gap-0.5" aria-label="Shelves">
        {CONTENT_TYPES.map((type) => (
          <Link
            key={type}
            href={searchHref({ origin: activeOrigin, type, query })}
            className={navClass(onSearch && activeType === type)}
            onClick={onNavigate}
          >
            {CONTENT_TYPE_LABELS[type]}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function SidebarNavFallback({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <SidebarBody
      pathname=""
      activeType={null}
      activeOrigin={null}
      onNavigate={onNavigate}
    />
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <SidebarBody
      pathname={pathname}
      activeType={searchParams.get("type")}
      activeOrigin={searchParams.get("origin")}
      query={searchParams.get("q")}
      onNavigate={onNavigate}
    />
  );
}
