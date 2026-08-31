import Link from "next/link";
import {
  REACTION_KINDS,
  REACTION_LABELS,
  type ContentType,
  type Origin,
  type ReactionKind,
} from "@/shared/types";

export function ReactionChips({
  active,
  query,
  origin,
  type,
}: {
  active?: ReactionKind;
  query?: string;
  origin?: Origin;
  type?: ContentType;
}) {
  const hrefFor = (reaction?: ReactionKind) => {
    const params = new URLSearchParams();
    if (query) {
      params.set("q", query);
    }
    if (origin) {
      params.set("origin", origin);
    }
    if (type) {
      params.set("type", type);
    }
    if (reaction) {
      params.set("reaction", reaction);
    }
    const search = params.toString();
    return search ? `/search?${search}` : "/search";
  };

  return (
    <ul className="flex flex-wrap gap-2">
      <li>
        <Link
          href={hrefFor()}
          className={`inline-block rounded-full border px-3 py-1 text-sm no-underline transition-colors ${
            !active
              ? "border-terracotta bg-terracotta text-paper"
              : "border-rule text-muted hover:border-terracotta hover:text-terracotta"
          }`}
        >
          All
        </Link>
      </li>
      {REACTION_KINDS.map((kind) => {
        const isActive = active === kind;
        return (
          <li key={kind}>
            <Link
              href={hrefFor(kind)}
              className={`inline-block rounded-full border px-3 py-1 text-sm no-underline transition-colors ${
                isActive
                  ? "border-terracotta bg-terracotta text-paper"
                  : "border-rule text-muted hover:border-terracotta hover:text-terracotta"
              }`}
            >
              {REACTION_LABELS[kind]}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
