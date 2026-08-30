import Link from "next/link";
import {
  CONTENT_TYPE_LABELS,
  CONTENT_TYPES,
  type ContentType,
  type Origin,
} from "@/shared/types";

export function TypeChips({
  active,
  query,
  origin,
}: {
  active?: ContentType;
  query?: string;
  origin?: Origin;
}) {
  const hrefFor = (type?: ContentType) => {
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
          All types
        </Link>
      </li>
      {CONTENT_TYPES.map((type) => {
        const isActive = active === type;
        return (
          <li key={type}>
            <Link
              href={hrefFor(type)}
              className={`inline-block rounded-full border px-3 py-1 text-sm no-underline transition-colors ${
                isActive
                  ? "border-terracotta bg-terracotta text-paper"
                  : "border-rule text-muted hover:border-terracotta hover:text-terracotta"
              }`}
            >
              {CONTENT_TYPE_LABELS[type]}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
