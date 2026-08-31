export const TOPICS = ["engineering", "essays", "startups", "design"] as const;

export type Topic = (typeof TOPICS)[number];

export const CONTENT_TYPES = ["blog", "paper", "tweet", "hn", "other"] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export type SourceKind = "company_blog" | "hn" | "essay" | "personal";

export type PostSummary = {
  id: number;
  url: string;
  title: string;
  excerpt: string;
  site: string;
  topic: Topic;
  contentType: ContentType;
  score: number;
  wordCount: number;
  publishedAt: number | null;
  discoveredVia: string;
  imageUrl?: string | null;
};

export type PostDetail = PostSummary & {
  body: string;
};

export function isTopic(value: string): value is Topic {
  return (TOPICS as readonly string[]).includes(value);
}

export function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  blog: "Blogs",
  paper: "Papers",
  tweet: "Tweets",
  hn: "Hacker News",
  other: "Everything else",
};

export const ORIGINS = ["suggested", "saved"] as const;

export type Origin = (typeof ORIGINS)[number];

export function isOrigin(value: string): value is Origin {
  return (ORIGINS as readonly string[]).includes(value);
}

export function originOf(discoveredVia: string): Origin {
  return discoveredVia === "saved" ? "saved" : "suggested";
}

export const ORIGIN_LABELS: Record<Origin, string> = {
  suggested: "Suggested",
  saved: "Yours",
};
