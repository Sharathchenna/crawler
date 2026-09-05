import { ItemList } from "@/components/ItemList";

export default function LibraryPage() {
  return (
    <div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">Library</h1>
      <p className="mb-4 text-[13px] text-[var(--text-muted)]">Everything you kept, newest first.</p>
      <ItemList emptyHint="Paste a URL above — your first save takes two seconds." />
    </div>
  );
}
