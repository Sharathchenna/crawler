import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-24 sm:px-8">
      <h1 className="text-4xl font-semibold tracking-tight text-ink">
        This page didn’t make the shelf.
      </h1>
      <p className="mt-4 text-lg text-muted">
        <Link href="/" className="text-terracotta">
          Return to the index
        </Link>
      </p>
    </main>
  );
}
