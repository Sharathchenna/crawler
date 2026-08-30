const SEARCH_ENDPOINT = "https://api.search.tinyfish.ai";
const FETCH_ENDPOINT = "https://api.fetch.tinyfish.ai";

const SEARCH_PURPOSE =
  "Find long-form original essays and company engineering blogs, not SEO listicles";
const FETCH_PURPOSE =
  "Extract the full blog post body. Ignore navigation, ads, comments, and footers.";

export type SearchHit = {
  title: string;
  url: string;
  snippet?: string;
};

export type FetchPage = {
  url: string;
  title: string;
  text: string;
  links: string[];
};

export type FetchError = {
  url: string;
  error: string;
};

function headers(apiKey: string): HeadersInit {
  return {
    "X-API-Key": apiKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function tinyfishSearch(
  apiKey: string,
  query: string,
  includeDomains?: string,
): Promise<SearchHit[]> {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("purpose", SEARCH_PURPOSE);
  if (includeDomains) {
    url.searchParams.set("include_domains", includeDomains);
  }

  const response = await fetch(url.toString(), { headers: headers(apiKey) });
  if (response.status === 429) {
    throw new Error("tinyfish_search_rate_limited");
  }
  if (!response.ok) {
    throw new Error(`tinyfish_search_${response.status}`);
  }

  const body = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; snippet?: string }>;
  };

  return (body.results ?? [])
    .map((result) => ({
      title: result.title ?? "",
      url: result.url ?? "",
      snippet: result.snippet,
    }))
    .filter((hit) => hit.url);
}

export async function tinyfishFetch(
  apiKey: string,
  urls: string[],
): Promise<{ pages: FetchPage[]; errors: FetchError[] }> {
  if (urls.length === 0) {
    return { pages: [], errors: [] };
  }

  const response = await fetch(FETCH_ENDPOINT, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      urls,
      format: "markdown",
      purpose: FETCH_PURPOSE,
      links: true,
    }),
  });

  if (response.status === 429) {
    throw new Error("tinyfish_fetch_rate_limited");
  }
  if (!response.ok) {
    throw new Error(`tinyfish_fetch_${response.status}`);
  }

  const body = (await response.json()) as {
    results?: Array<{
      url?: string;
      title?: string;
      text?: string;
      links?: string[];
    }>;
    errors?: Array<{ url?: string; error?: string }>;
  };

  return {
    pages: (body.results ?? []).map((page) => ({
      url: page.url ?? "",
      title: page.title ?? "",
      text: page.text ?? "",
      links: page.links ?? [],
    })),
    errors: (body.errors ?? []).map((error) => ({
      url: error.url ?? "",
      error: error.error ?? "unknown",
    })),
  };
}
