import { crawlerRequest } from "@/lib/origin";

export async function POST(request: Request) {
  const body = await request.text();
  try {
    const response = await crawlerRequest("/api/react", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
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

export async function DELETE(request: Request) {
  const body = await request.text();
  try {
    const response = await crawlerRequest("/api/react", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
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
