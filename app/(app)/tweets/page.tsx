import { ItemList } from "@/components/ItemList";

export default function TweetsPage() {
  return (
    <div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">Tweets</h1>
      <p className="mb-4 text-[13px] text-[var(--text-muted)]">Interesting posts and threads, newest first.</p>
      <ItemList typeFilter="x" emptyHint="Save an x.com link above — threads land here automatically." />
    </div>
  );
}
