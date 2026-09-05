import { ItemList } from "@/components/ItemList";

export default function ArticlesPage() {
  return (
    <div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">Articles</h1>
      <p className="mb-4 text-[13px] text-[var(--text-muted)]">Interesting reads and papers, newest first.</p>
      <ItemList typeFilter="page,pdf" emptyHint="Save an article or paper above — reads land here automatically." />
    </div>
  );
}
