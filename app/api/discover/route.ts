import { crawlerRequest } from "@/lib/origin";

export async function POST() {
  try {
    const response = await crawlerRequest("/api/discover", {
      method: "POST",
      signal: AbortSignal.timeout(60000),
    });
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch {
    return Response.json(
      { error: "Crawler is not running. Start it with bun run dev:crawler." },
      { status: 503 },
    );
  }
}
