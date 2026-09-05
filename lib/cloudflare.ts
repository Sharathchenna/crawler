// Cloudflare Workers AI Markdown Conversion (toMarkdown) client.
// Docs: https://developers.cloudflare.com/workers-ai/features/markdown-conversion/
// Used as a fallback for files (PDFs, office docs) that have no readable
// HTML: file bytes go up, Markdown comes back. Optional — when the env vars
// are unset the feature is silently disabled and callers use their own
// fallbacks. Works from Node and (later) from Workers unchanged.

export type ConvertedDoc = { markdown: string; tokens?: number };

function config(): { accountId: string; token: string } | null {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const token = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  if (!accountId || !token) return null;
  return { accountId, token };
}

export function isCloudflareConversionConfigured(): boolean {
  return config() !== null;
}

/** Pure parser for the toMarkdown response shape — unit-testable. */
export function pickMarkdown(payload: unknown): ConvertedDoc | null {
  if (!payload || typeof payload !== "object") return null;
  const result = (payload as { result?: unknown }).result;
  const files = Array.isArray(result) ? result : [result];
  for (const f of files) {
    if (!f || typeof f !== "object") continue;
    const row = f as { format?: unknown; data?: unknown; tokens?: unknown };
    if (row.format === "markdown" && typeof row.data === "string" && row.data.trim()) {
      return {
        markdown: row.data,
        tokens: typeof row.tokens === "number" ? row.tokens : undefined,
      };
    }
  }
  return null;
}

export async function convertToMarkdown(input: {
  bytes: ArrayBuffer;
  filename: string;
  mimeType: string;
  timeoutMs?: number;
}): Promise<ConvertedDoc | null> {
  const cfg = config();
  if (!cfg) return null;
  if (!input.bytes.byteLength) return null;
  try {
    const form = new FormData();
    form.append(
      "files",
      new Blob([input.bytes], { type: input.mimeType || "application/octet-stream" }),
      input.filename
    );
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/ai/tomarkdown`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}` },
      body: form,
      signal: AbortSignal.timeout(input.timeoutMs ?? 120_000),
    });
    if (!res.ok) return null;
    return pickMarkdown(await res.json());
  } catch {
    return null;
  }
}
