import { ItemList } from "@/components/ItemList";

export default function InboxPage() {
  return (
    <div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">Inbox</h1>
      <p className="mb-4 text-[13px] text-[var(--text-muted)]">Fresh captures waiting for triage. Save, done, or archive.</p>
      <ItemList statusFilter="inbox" emptyHint="Inbox zero. Paste a URL above to hoard something new." />
    </div>
  );
}
