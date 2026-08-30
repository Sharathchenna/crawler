import Link from "next/link";
import { TOPICS, type Topic } from "@/shared/types";

const labels: Record<Topic, string> = {
  engineering: "Engineering",
  essays: "Essays",
  startups: "Startups",
  design: "Design",
};

export function TopicChips({
  active,
  query,
}: {
  active?: Topic;
  query?: string;
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {TOPICS.map((topic) => {
        const params = new URLSearchParams();
        if (query) {
          params.set("q", query);
        }
        params.set("topic", topic);
        const href = `/search?${params.toString()}`;
        const isActive = active === topic;

        return (
          <li key={topic}>
            <Link
              href={href}
              className={`inline-block rounded-full border px-3 py-1 text-sm no-underline transition-colors ${
                isActive
                  ? "border-terracotta bg-terracotta text-paper"
                  : "border-rule text-muted hover:border-terracotta hover:text-terracotta"
              }`}
            >
              {labels[topic]}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
