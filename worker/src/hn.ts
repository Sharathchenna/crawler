import { SUGGESTED_WINDOW_MS } from "../../shared/freshness";

export type HnStory = {
  title: string;
  url: string;
  points: number;
  comments: number;
  createdAt: number | null;
};

type AlgoliaHit = {
  title?: string;
  url?: string | null;
  points?: number;
  num_comments?: number;
  created_at_i?: number;
};

async function fetchAlgolia(url: string): Promise<HnStory[]> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`hn_algolia_${response.status}`);
  }

  const body = (await response.json()) as { hits?: AlgoliaHit[] };
  return (body.hits ?? [])
    .filter((hit): hit is AlgoliaHit & { url: string } => Boolean(hit.url))
    .map((hit) => ({
      title: hit.title ?? "Untitled",
      url: hit.url,
      points: hit.points ?? 0,
      comments: hit.num_comments ?? 0,
      createdAt: hit.created_at_i ? hit.created_at_i * 1000 : null,
    }));
}

function uniqueByUrl(stories: HnStory[]): HnStory[] {
  const byUrl = new Map<string, HnStory>();
  for (const story of stories) {
    if (!byUrl.has(story.url)) {
      byUrl.set(story.url, story);
    }
  }
  return [...byUrl.values()];
}

export async function fetchHnFavorites(): Promise<HnStory[]> {
  const weekAgo = Math.floor((Date.now() - SUGGESTED_WINDOW_MS) / 1000);

  const [newest, best] = await Promise.all([
    fetchAlgolia(
      `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points>=30,num_comments>=8,created_at_i>${weekAgo}&hitsPerPage=50`,
    ),
    fetchAlgolia(
      `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=points>=40,num_comments>=10,created_at_i>${weekAgo}&hitsPerPage=40`,
    ),
  ]);

  return uniqueByUrl([...best, ...newest]);
}
