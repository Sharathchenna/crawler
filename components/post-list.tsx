import { PageShot } from "@/components/page-shot";
import { TweetEmbed } from "@/components/tweet-embed";
import { faviconUrl, formatDate, siteLabel } from "@/lib/format";
import { CONTENT_TYPE_LABELS, type ContentType, type PostSummary } from "@/shared/types";

const TYPE_BADGE: Record<ContentType, string> = {
  blog: "bg-terracotta text-paper",
  paper: "bg-ink text-paper",
  tweet: "bg-paper text-ink",
  hn: "bg-terracotta/90 text-paper",
  other: "bg-paper-deep text-ink",
};

function Cover({ post }: { post: PostSummary }) {
  const site = siteLabel(post.site);

  if (post.contentType === "paper") {
    return (
      <div className="flex h-full flex-col bg-[#f7f1e4] px-5 py-4">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-terracotta">
          Abstract
        </p>
        <p className="mt-3 line-clamp-6 text-sm leading-relaxed text-ink">
          {post.excerpt || post.title}
        </p>
        <p className="mt-auto pt-3 text-xs text-muted">{site}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-between bg-paper-deep/80 p-5">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted">
        {site}
      </p>
      <p className="line-clamp-4 text-xl font-semibold leading-snug tracking-tight text-ink">
        {post.title}
      </p>
      {post.excerpt ? (
        <p className="line-clamp-3 text-sm leading-relaxed text-muted">{post.excerpt}</p>
      ) : (
        <span />
      )}
    </div>
  );
}

function Favicon({ site }: { site: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={faviconUrl(site)}
      alt=""
      width={16}
      height={16}
      className="h-4 w-4 rounded-sm"
    />
  );
}

function CardMeta({ post }: { post: PostSummary }) {
  return (
    <p className="flex items-center gap-2 text-xs text-muted">
      <Favicon site={post.site} />
      <span className="truncate">{siteLabel(post.site)}</span>
      <span aria-hidden="true">·</span>
      <span className="shrink-0">{formatDate(post.publishedAt)}</span>
    </p>
  );
}

function TweetCard({ post }: { post: PostSummary }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-rule bg-paper shadow-[0_1px_0_rgb(44_36_22_/_0.04)]">
      <div className="relative max-h-72 overflow-hidden">
        <TweetEmbed url={post.url} />
        <a
          href={post.url}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto absolute inset-x-0 bottom-0 flex h-16 items-end justify-center bg-gradient-to-t from-paper via-paper/80 to-transparent pb-2 text-xs font-medium text-terracotta no-underline"
        >
          Open on X
        </a>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <CardMeta post={post} />
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${TYPE_BADGE.tweet}`}
        >
          {CONTENT_TYPE_LABELS.tweet}
        </span>
      </div>
    </article>
  );
}

export function PostCard({ post }: { post: PostSummary }) {
  if (post.contentType === "tweet") {
    return <TweetCard post={post} />;
  }

  return (
    <a
      href={post.url}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-rule bg-paper no-underline shadow-[0_1px_0_rgb(44_36_22_/_0.04)] transition hover:-translate-y-0.5 hover:border-terracotta hover:shadow-[0_12px_30px_rgb(44_36_22_/_0.08)]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-paper-deep">
        <Cover post={post} />
        <PageShot url={post.url} />
        <span
          className={`absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${TYPE_BADGE[post.contentType]}`}
        >
          {CONTENT_TYPE_LABELS[post.contentType]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 py-4">
        <CardMeta post={post} />
        <h2 className="text-base font-semibold leading-snug tracking-tight text-ink group-hover:text-terracotta">
          {post.title}
        </h2>
        {post.excerpt ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted">{post.excerpt}</p>
        ) : null}
      </div>
    </a>
  );
}

export function PostList({
  posts,
  empty = "Nothing on this shelf yet.",
}: {
  posts: PostSummary[];
  empty?: string;
}) {
  if (posts.length === 0) {
    return (
      <p className="border-t border-rule pt-8 text-lg text-muted">{empty}</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
