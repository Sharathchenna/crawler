import { describe, expect, test } from "bun:test";
import { extractBookmarkImports } from "./birdclaw";

describe("extractBookmarkImports", () => {
  test("reads birdclaw search envelopes with canonical URLs and text", () => {
    const items = extractBookmarkImports({
      ok: true,
      data: {
        items: [
          {
            id: "1891234567890",
            canonicalUrl: "https://x.com/steipete/status/1891234567890",
            plainText: "Local-first Twitter memory.",
            author: { username: "steipete", name: "Peter" },
            createdAt: "2026-03-01T12:00:00.000Z",
          },
        ],
      },
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe("https://x.com/steipete/status/1891234567890");
    expect(items[0]?.title).toBe("Peter (@steipete)");
    expect(items[0]?.excerpt).toBe("Local-first Twitter memory.");
    expect(items[0]?.publishedAt).toBe(Date.parse("2026-03-01T12:00:00.000Z"));
  });

  test("reads JSONL, raw URLs, and Twitter archive bookmark dumps", () => {
    const jsonl = [
      JSON.stringify({
        tweetId: "1111111111111111111",
        username: "alice",
        text: "one",
      }),
      JSON.stringify({
        id: "2222222222222222222",
        author: { handle: "bob" },
        full_text: "two",
      }),
    ].join("\n");
    expect(extractBookmarkImports(jsonl).map((item) => item.url)).toEqual([
      "https://x.com/alice/status/1111111111111111111",
      "https://x.com/bob/status/2222222222222222222",
    ]);

    const urls = extractBookmarkImports(
      "see https://twitter.com/c/status/3333333333333333333 and https://x.com/d/status/4444444444444444444",
    );
    expect(urls.map((item) => item.url)).toEqual([
      "https://x.com/c/status/3333333333333333333",
      "https://x.com/d/status/4444444444444444444",
    ]);

    const archive = extractBookmarkImports(
      `window.YTD.bookmark.part0 = ${JSON.stringify([
        { sortIndex: "1", bookmark: { tweetId: "5555555555555555555" } },
      ])}`,
    );
    expect(archive[0]?.url).toBe("https://x.com/i/status/5555555555555555555");
  });

  test("dedupes the same status id", () => {
    const items = extractBookmarkImports([
      "https://x.com/a/status/1891234567890",
      "https://twitter.com/a/status/1891234567890",
    ]);
    expect(items).toHaveLength(1);
  });
});
