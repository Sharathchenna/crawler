export function crawlerOrigin(): string {
  return process.env.CRAWLER_ORIGIN ?? "http://127.0.0.1:8787";
}

export async function crawlerRequest(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${crawlerOrigin()}${path}`, {
    cache: "no-store",
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
}

export async function crawlerFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const response = await crawlerRequest(path, {
      signal: AbortSignal.timeout(8000),
      ...init,
    });

    if (!response.ok) {
      console.error("crawler fetch failed", response.status, path);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error("crawler fetch error", path, error);
    return null;
  }
}
