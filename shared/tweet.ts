export type TweetPreview = {
  text: string;
  handle: string;
  name: string;
  imageUrl: string | null;
  publishedAt: number | null;
};

export function tweetStatusId(rawUrl: string): string | null {
  try {
    const match = new URL(rawUrl).pathname.match(/\/status\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function tweetHandleFromUrl(rawUrl: string): string | null {
  try {
    const handle = new URL(rawUrl).pathname.split("/").filter(Boolean)[0];
    if (!handle || handle === "i" || handle === "status") {
      return null;
    }
    return handle;
  } catch {
    return null;
  }
}

/** Direct JPEG of the first photo (or a 404 if the tweet has none). */
export function tweetEmbedImageUrl(rawUrl: string): string | null {
  const id = tweetStatusId(rawUrl);
  const handle = tweetHandleFromUrl(rawUrl) ?? "i";
  if (!id) {
    return null;
  }
  return `https://d.fxtwitter.com/${encodeURIComponent(handle)}/status/${id}.jpg`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function pickMediaUrl(media: Record<string, unknown> | null): string | null {
  if (!media) {
    return null;
  }
  const mosaic = asRecord(media.mosaic);
  const formats = asRecord(mosaic?.formats ?? mosaic);
  const mosaicUrl =
    asString(formats?.jpeg) ??
    asString(formats?.webp) ??
    asString(mosaic?.url);
  if (mosaicUrl) {
    return mosaicUrl;
  }
  const photos = Array.isArray(media.photos) ? media.photos : [];
  for (const photo of photos) {
    const url = asString(asRecord(photo)?.url);
    if (url) {
      return url;
    }
  }
  const videos = Array.isArray(media.videos) ? media.videos : [];
  for (const video of videos) {
    const row = asRecord(video);
    const url =
      asString(row?.thumbnail_url) ??
      asString(row?.thumbnail) ??
      asString(row?.preview_image_url);
    if (url) {
      return url;
    }
  }
  const all = Array.isArray(media.all) ? media.all : [];
  for (const item of all) {
    const row = asRecord(item);
    const url =
      asString(row?.url) ??
      asString(row?.thumbnail_url) ??
      asString(row?.thumbnail);
    if (url) {
      return url;
    }
  }
  return null;
}

export async function fetchTweetPreview(
  rawUrl: string,
): Promise<TweetPreview | null> {
  const id = tweetStatusId(rawUrl);
  if (!id) {
    return null;
  }
  const handle = tweetHandleFromUrl(rawUrl);
  const apiUrl = handle
    ? `https://api.fxtwitter.com/${encodeURIComponent(handle)}/status/${id}`
    : `https://api.fxtwitter.com/status/${id}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "parchment-crawler/1.0 (personal reading list)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    const root = asRecord(body);
    const tweet = asRecord(root?.tweet);
    if (!tweet) {
      return null;
    }
    const author = asRecord(tweet.author);
    const text = asString(tweet.text) ?? asString(tweet.raw_text);
    const screenName =
      asString(author?.screen_name) ?? handle ?? "tweet";
    const name = asString(author?.name) ?? screenName;
    const created = tweet.created_timestamp;
    const publishedAt =
      typeof created === "number" ? created * 1000 : null;

    return {
      text: text ?? "",
      handle: screenName,
      name,
      imageUrl: pickMediaUrl(asRecord(tweet.media)),
      publishedAt,
    };
  } catch (error) {
    console.error("tweet preview failed", rawUrl, error);
    return null;
  }
}

export function tweetCardText(title: string, excerpt: string): string {
  const trimmed = excerpt.trim();
  if (
    !trimmed ||
    trimmed.startsWith("http") ||
    /\d+\s+points/i.test(trimmed)
  ) {
    return title;
  }
  return trimmed;
}
