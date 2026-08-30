import { APP_NAME } from "@/lib/config";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-24 sm:px-8">
      <h1 className="text-4xl font-semibold tracking-tight text-ink">
        You’re offline.
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted">
        {APP_NAME} will show pages you’ve already opened. Reconnect to look for
        new writing.
      </p>
    </main>
  );
}
