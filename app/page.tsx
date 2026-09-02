import Link from "next/link";
import { DiscoverButton } from "@/components/discover-button";
import { ImportBookmarks } from "@/components/import-bookmarks";
import { PostList } from "@/components/post-list";
import { SaveForm } from "@/components/save-form";
import { SearchForm } from "@/components/search-form";
import { listPosts } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function HomePage() {
  const [yours, suggested] = await Promise.all([
    listPosts({ origin: "saved", limit: 9 }),
    listPosts({ origin: "suggested", limit: 9 }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-12 sm:px-8 sm:py-16">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-terracotta">
          A library of the open web
        </p>
        <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.15] tracking-tight text-ink sm:text-5xl">
          What you save, and what the crawler finds.
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
          Two shelves. Yours is anything you paste — tweets, papers, blogs.
          Suggested is what the crawler brings in from HN, arXiv, and the open
          web. Like, pass, or mark a card read and it files in Archive so these
          shelves stay new.
        </p>
        <div className="mt-10">
          <SearchForm />
        </div>
      </div>

      <section className="mt-16">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
              Yours
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Paste a URL you found interesting. Tweets, papers, anything. Mark
              it read when you are done. Import X bookmarks from{" "}
              <a href="https://birdclaw.sh/" className="text-terracotta">
                birdclaw
              </a>
              .
            </p>
          </div>
          <Link
            href="/search?origin=saved"
            className="text-xs font-medium uppercase tracking-[0.16em] text-terracotta no-underline"
          >
            See all
          </Link>
        </div>
        <div className="mb-8 max-w-2xl">
          <SaveForm />
          <ImportBookmarks />
        </div>
        <PostList
          posts={yours}
          empty="Nothing saved yet. Paste a tweet, paper, or any URL above."
        />
      </section>

      <section className="mt-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
              Suggested
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted">
              HN favorites, new arXiv papers, and company blogs. Like what you
              want more of, pass the rest. Runs on a schedule, or hit Find more.
            </p>
          </div>
          <div className="flex items-center gap-5">
            <DiscoverButton />
            <Link
              href="/search?origin=archived"
              className="text-xs font-medium uppercase tracking-[0.16em] text-muted no-underline hover:text-terracotta"
            >
              Archive
            </Link>
            <Link
              href="/search?origin=suggested"
              className="text-xs font-medium uppercase tracking-[0.16em] text-terracotta no-underline"
            >
              See all
            </Link>
          </div>
        </div>
        <PostList
          posts={suggested}
          empty="No suggestions yet. Start the crawler, then Find more — or everything here is already in Archive."
        />
      </section>
    </main>
  );
}
