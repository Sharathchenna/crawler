import { describe, expect, test } from "bun:test";
import {
  avoidedDomains,
  preferenceBoost,
  rankForSuggested,
  rankValue,
  signalsFromReactions,
} from "./preference";
import type { RankablePost } from "./preference";

const now = 1_700_000_000_000;

function post(overrides: Partial<RankablePost> & { id: number }): RankablePost {
  return {
    site: "example.com",
    topic: "engineering",
    contentType: "blog",
    score: 80,
    publishedAt: now,
    ...overrides,
  };
}

describe("signalsFromReactions", () => {
  test("likes boost site, topic, and type; reads are ignored", () => {
    const signals = signalsFromReactions(
      [
        {
          kind: "like",
          site: "stripe.com",
          topic: "engineering",
          contentType: "blog",
        },
        {
          kind: "read",
          site: "paulgraham.com",
          topic: "essays",
          contentType: "blog",
        },
        {
          kind: "dislike",
          site: "medium.com",
          topic: "startups",
          contentType: "hn",
        },
      ],
      [42, 42, 0],
    );

    expect(signals.sites).toEqual({ "stripe.com": 1, "medium.com": -1 });
    expect(signals.topics).toEqual({ engineering: 1, startups: -1 });
    expect(signals.types).toEqual({ blog: 1, hn: -1 });
    expect(signals.similarIds).toEqual([42]);
  });
});

describe("preferenceBoost", () => {
  test("raises liked sites and similar ids, lowers passed sites", () => {
    const signals = signalsFromReactions(
      [
        {
          kind: "like",
          site: "stripe.com",
          topic: "engineering",
          contentType: "blog",
        },
        {
          kind: "dislike",
          site: "medium.com",
          topic: "startups",
          contentType: "hn",
        },
      ],
      [7],
    );

    expect(
      preferenceBoost(
        post({ id: 1, site: "stripe.com", topic: "engineering", contentType: "blog" }),
        signals,
      ),
    ).toBe(12 + 7 + 5);

    expect(
      preferenceBoost(
        post({
          id: 2,
          site: "medium.com",
          topic: "startups",
          contentType: "hn",
        }),
        signals,
      ),
    ).toBe(-12 - 7 - 5);

    expect(
      preferenceBoost(
        post({
          id: 7,
          site: "other.dev",
          topic: "design",
          contentType: "other",
        }),
        signals,
      ),
    ).toBe(10);
  });
});

describe("rankForSuggested", () => {
  test("orders a passed site below a liked site of the same age", () => {
    const signals = signalsFromReactions([
      {
        kind: "like",
        site: "stripe.com",
        topic: "engineering",
        contentType: "blog",
      },
      {
        kind: "dislike",
        site: "medium.com",
        topic: "engineering",
        contentType: "blog",
      },
    ]);

    const ranked = rankForSuggested(
      [
        post({ id: 1, site: "medium.com", score: 99 }),
        post({ id: 2, site: "stripe.com", score: 70 }),
      ],
      signals,
      now,
    );

    expect(ranked.map((item) => item.id)).toEqual([2, 1]);
  });

  test("still prefers a fresh link over a stale high score when taste is empty", () => {
    const fresh = post({
      id: 1,
      score: 70,
      publishedAt: now,
    });
    const stale = post({
      id: 2,
      score: 99,
      publishedAt: now - 6 * 24 * 60 * 60 * 1000,
    });

    expect(rankValue(fresh, signalsFromReactions([]), now)).toBeGreaterThan(
      rankValue(stale, signalsFromReactions([]), now),
    );
  });
});

describe("avoidedDomains", () => {
  test("returns sites with a net pass", () => {
    const signals = signalsFromReactions([
      {
        kind: "dislike",
        site: "medium.com",
        topic: "essays",
        contentType: "blog",
      },
      {
        kind: "like",
        site: "stripe.com",
        topic: "engineering",
        contentType: "blog",
      },
      {
        kind: "like",
        site: "medium.com",
        topic: "engineering",
        contentType: "blog",
      },
    ]);

    expect([...avoidedDomains(signals)]).toEqual([]);
    expect(
      [...avoidedDomains(signalsFromReactions([
        {
          kind: "dislike",
          site: "tabloid.test",
          topic: "essays",
          contentType: "hn",
        },
      ]))],
    ).toEqual(["tabloid.test"]);
  });
});
