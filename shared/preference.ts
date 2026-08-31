import { SUGGESTED_WINDOW_MS } from "./freshness";
import type {
  ContentType,
  ReactionKind,
  Topic,
} from "./types";

export type PreferenceSignals = {
  sites: Record<string, number>;
  topics: Record<string, number>;
  types: Record<string, number>;
  similarIds: number[];
};

export type RankablePost = {
  id: number;
  site: string;
  topic: Topic;
  contentType: ContentType;
  score: number;
  publishedAt: number | null;
  createdAt?: number | null;
};

export const EMPTY_SIGNALS: PreferenceSignals = {
  sites: {},
  topics: {},
  types: {},
  similarIds: [],
};

type ReactionRow = {
  kind: ReactionKind;
  site: string;
  topic: Topic;
  contentType: ContentType;
};

function bump(map: Record<string, number>, key: string, delta: number): void {
  map[key] = (map[key] ?? 0) + delta;
}

export function signalsFromReactions(
  rows: ReactionRow[],
  similarIds: number[] = [],
): PreferenceSignals {
  const signals: PreferenceSignals = {
    sites: {},
    topics: {},
    types: {},
    similarIds: [...new Set(similarIds.filter((id) => id > 0))],
  };

  for (const row of rows) {
    const delta = row.kind === "like" ? 1 : row.kind === "dislike" ? -1 : 0;
    if (delta === 0) {
      continue;
    }
    bump(signals.sites, row.site, delta);
    bump(signals.topics, row.topic, delta);
    bump(signals.types, row.contentType, delta);
  }

  return signals;
}

export function preferenceBoost(
  post: RankablePost,
  signals: PreferenceSignals,
): number {
  let boost = 0;
  boost += (signals.sites[post.site] ?? 0) * 12;
  boost += (signals.topics[post.topic] ?? 0) * 7;
  boost += (signals.types[post.contentType] ?? 0) * 5;
  if (signals.similarIds.includes(post.id)) {
    boost += 10;
  }
  return boost;
}

export function rankValue(
  post: RankablePost,
  signals: PreferenceSignals,
  now = Date.now(),
): number {
  const foundAt = post.publishedAt ?? post.createdAt ?? now;
  const recency = Math.max(0, 1 - (now - foundAt) / SUGGESTED_WINDOW_MS);
  return recency * 40 + post.score * 0.3 + preferenceBoost(post, signals);
}

export function rankForSuggested<T extends RankablePost>(
  posts: T[],
  signals: PreferenceSignals,
  now = Date.now(),
): T[] {
  return [...posts].sort((a, b) => rankValue(b, signals, now) - rankValue(a, signals, now));
}

export function avoidedDomains(signals: PreferenceSignals): Set<string> {
  const avoided = new Set<string>();
  for (const [site, delta] of Object.entries(signals.sites)) {
    if (delta < 0) {
      avoided.add(site);
    }
  }
  return avoided;
}
