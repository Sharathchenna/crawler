"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Index" },
  { href: "/search", label: "Search" },
  { href: "/about", label: "About" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-3xl items-baseline justify-between gap-6 px-5 py-6 sm:px-8">
        <Link href="/" className="group no-underline">
          <span className="font-display text-[1.65rem] italic leading-none tracking-tight text-ink">
            Parchment
          </span>
          <span className="mt-1 block font-serif text-[0.7rem] uppercase tracking-[0.22em] text-muted">
            Link library
          </span>
        </Link>
        <nav className="flex items-center gap-5 font-serif text-sm text-muted">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`no-underline transition-colors hover:text-terracotta ${
                  active ? "text-ink" : ""
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
