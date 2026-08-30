import type { Topic } from "../../shared/types";

const SKIP_TITLES =
  /^(home|pricing|careers|sign in|log in|privacy|terms|about us|contact)$/i;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function excerptFrom(text: string, max = 280): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) {
    return plain;
  }
  return `${plain.slice(0, max).trimEnd()}…`;
}

export function heuristicOk(title: string, body: string): boolean {
  if (SKIP_TITLES.test(title.trim())) {
    return false;
  }
  return wordCount(body) >= 800;
}

export function heuristicScore(body: string): number {
  const words = wordCount(body);
  return Math.min(94, 48 + Math.round(words / 120));
}

export function guessTopic(title: string, body: string): Topic {
  const hay = `${title}\n${body}`.toLowerCase();
  if (/(design system|typography|figma|interface|visual)/.test(hay)) {
    return "design";
  }
  if (/(startup|founder|venture|seed round|product-market)/.test(hay)) {
    return "startups";
  }
  if (/(essay|writing|life|philosophy|career advice)/.test(hay)) {
    return "essays";
  }
  return "engineering";
}

type AiBinding = Ai;

export async function scoreWithAi(
  ai: AiBinding,
  title: string,
  body: string,
): Promise<{ score: number; topic: Topic } | null> {
  const sample = body.slice(0, 4000);
  try {
    const result = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content:
            'You score blog posts. Reply with JSON only: {"score":0-100,"topic":"engineering"|"essays"|"startups"|"design"}. High scores are original, specific, and worth bookmarking. Low scores are listicles, marketing, or thin.',
        },
        {
          role: "user",
          content: `Title: ${title}\n\n${sample}`,
        },
      ],
      max_tokens: 120,
    });

    const text =
      typeof result === "object" && result && "response" in result
        ? String((result as { response: unknown }).response)
        : String(result);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    const parsed = JSON.parse(match[0]) as {
      score?: number;
      topic?: string;
    };
    const score = Number(parsed.score);
    if (!Number.isFinite(score)) {
      return null;
    }
    const allowed = ["engineering", "essays", "startups", "design"] as const;
    const safeTopic = allowed.includes(parsed.topic as Topic)
      ? (parsed.topic as Topic)
      : guessTopic(title, body);
    return { score: Math.max(0, Math.min(100, score)), topic: safeTopic };
  } catch {
    return null;
  }
}
