import { ItemList } from "@/components/ItemList";

export default function ReposPage() {
  return (
    <div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">Repos</h1>
      <p className="mb-4 text-[13px] text-[var(--text-muted)]">Interesting GitHub repos, newest first.</p>
      <ItemList typeFilter="repo" emptyHint="Paste a github.com/owner/repo link above — it lands here automatically." />
    </div>
  );
}
