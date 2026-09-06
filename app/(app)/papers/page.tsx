import { ItemList } from "@/components/ItemList";

export default function PapersPage() {
  return (
    <div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">Research papers</h1>
      <p className="mb-4 text-[13px] text-[var(--text-muted)]">arXiv papers with full text, newest first.</p>
      <ItemList sourceFilter="arxiv" emptyHint="Paste an arxiv.org abs, PDF, or ar5iv link above — the full text lands here automatically." />
    </div>
  );
}
