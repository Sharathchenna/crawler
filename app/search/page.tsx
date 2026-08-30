import { PostList } from "@/components/post-list";
import { SaveForm } from "@/components/save-form";
import { SearchForm } from "@/components/search-form";
import { TypeChips } from "@/components/type-chips";
import {
  listPosts,
  parseOriginParam,
  parseQueryParam,
  parseTypeParam,
  searchPosts,
} from "@/lib/posts";
import { CONTENT_TYPE_LABELS, ORIGIN_LABELS } from "@/shared/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    type?: string | string[];
    topic?: string | string[];
    origin?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const query = parseQueryParam(params.q);
  const contentType = parseTypeParam(params.type);
  const origin = parseOriginParam(params.origin);
  const posts =
    query || contentType
      ? await searchPosts(query, { contentType, origin })
      : await listPosts({ origin, limit: 48 });

  const heading = query
    ? `Results for “${query}”`
    : origin && contentType
      ? `${ORIGIN_LABELS[origin]} · ${CONTENT_TYPE_LABELS[contentType]}`
      : origin
        ? ORIGIN_LABELS[origin]
        : contentType
          ? CONTENT_TYPE_LABELS[contentType]
          : "Search the library";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-ink">
        {heading}
      </h1>
      <p className="mt-3 text-sm text-muted">
        {posts.length === 0
          ? "No links on this shelf yet."
          : `${posts.length} link${posts.length === 1 ? "" : "s"}.`}
      </p>
      {origin === "saved" && !query ? (
        <div className="mt-8 max-w-2xl">
          <p className="mb-4 text-sm text-muted">
            Paste a tweet, paper, blog, or any URL you want to keep.
          </p>
          <SaveForm />
        </div>
      ) : null}
      <div className="mt-8 max-w-2xl">
        <SearchForm
          defaultQuery={query}
          defaultType={contentType}
          defaultOrigin={origin}
        />
      </div>
      <div className="mt-6">
        <TypeChips active={contentType} query={query} origin={origin} />
      </div>
      <section className="mt-14">
        <PostList
          posts={posts}
          empty={
            origin === "saved"
              ? "Nothing in Yours yet. Paste a URL above."
              : origin === "suggested"
                ? "No suggestions yet. Use Find more on the index."
                : "Nothing on this shelf yet."
          }
        />
      </section>
    </main>
  );
}
