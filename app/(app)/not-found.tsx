import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="mx-auto mt-24 max-w-md rounded-[10px] border border-[var(--border-soft)] bg-[var(--bg-raised)] p-6 text-center">
      <h1 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--text)]">
        Nothing here
      </h1>
      <p className="mt-2 text-[13px] leading-6 text-[var(--text-muted)]">
        This page doesn&apos;t exist — or you&apos;re not signed in. Hoard uses
        Cloudflare Access for identity: sign in through your team&apos;s Access
        login and you&apos;ll land in your library automatically.
      </p>
      <Link
        href="/library"
        className="mt-4 inline-block rounded-[6px] bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white"
      >
        Go to Library
      </Link>
    </div>
  );
}
