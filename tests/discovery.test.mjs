import { after, before, beforeEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

// Exercise real handlers, Prisma and D1 batches, replacing only identity and
// Cloudflare binding discovery. Tinyfish HTTP responses are mocked per test.
let mf, db, api, scratch;
const oldKey = process.env.TINYFISH_API_KEY;
const input = { topics: "independent software engineering", seeds: [], budget: 20 };
const article = (url, minutes = 4) => ({ url, minutes, title: "A useful essay", author: "An author", summary: "A concrete explanation.", reason: "Matches software engineering." });
const req = (method = "GET", body, user = "reader") => new Request("https://hoard.local/api/discover", {
  method, headers: user ? { "x-test-user": user, "Content-Type": "application/json" } : {},
  body: body === undefined ? undefined : JSON.stringify(body),
});
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"], compatibilityDate: "2024-12-30" }));
  const binding = await mf.getD1Database("DB");
  for (const file of ["0001_init.sql", "0002_discovery.sql", "0004_discovery_schedule.sql", "0005_discovery_images.sql"]) {
    const sql = await readFile(`db/migrations/${file}`, "utf8");
    for (const statement of sql.split(";").filter((s) => s.trim())) await binding.prepare(statement).run();
  }
  db = new PrismaClient({ adapter: new PrismaD1(binding) });
  globalThis.__discoveryTest = { db, binding };
  scratch = await mkdtemp(path.resolve("node_modules/.discovery-test-"));
  const outfile = path.join(scratch, "handlers.cjs");
  await build({
    stdin: { contents: 'export * from "./app/api/discover/route"; export * from "./lib/discovery"; export * from "./lib/discovery-store"; export * from "./lib/discovery-feeds"; export * from "./lib/discovery-sources"; export * from "./workers/discovery";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, platform: "node", format: "cjs", packages: "external", outfile,
    plugins: [{ name: "test-bindings", setup(builder) {
      builder.onResolve({ filter: /^(@\/lib\/(auth|db)|@opennextjs\/cloudflare)$/ }, (args) => ({ path: args.path, namespace: "test-binding" }));
      builder.onLoad({ filter: /.*/, namespace: "test-binding" }, ({ path: name }) => ({ contents:
        name.endsWith("/auth") ? 'export async function requireUser(req) { const id = req.headers.get("x-test-user"); return id ? globalThis.__discoveryTest.db.user.findUnique({where:{id}}) : null; }' :
        name.endsWith("/db") ? 'export function getDb() { return globalThis.__discoveryTest.db; }' :
        'export function getCloudflareContext() { return {env:{DB:globalThis.__discoveryTest.binding}}; }', loader: "js" }));
    } }],
  });
  api = createRequire(import.meta.url)(outfile);
});

beforeEach(async () => {
  mock.restoreAll();
  process.env.TINYFISH_API_KEY = "test-only-not-a-real-key";
  await db.discoveryArticle.deleteMany();
  await db.discoveryDigest.deleteMany();
  await db.item.deleteMany();
  await db.user.deleteMany();
  await db.user.createMany({ data: ["reader", "other"].map((id) => ({ id, email: `${id}@example.org`, password: "test" })) });
});

after(async () => {
  mock.restoreAll();
  if (oldKey === undefined) delete process.env.TINYFISH_API_KEY;
  else process.env.TINYFISH_API_KEY = oldKey;
  await db?.$disconnect();
  await mf?.dispose();
  if (scratch) await rm(scratch, { recursive: true, force: true });
  delete globalThis.__discoveryTest;
});

test("rejects malformed inputs, local URLs and social feeds; removes tracking", () => {
  for (const value of [null, [], { ...input, topics: 42 }, { ...input, budget: 500 }, { ...input, seeds: ["http://127.0.0.1/"] }]) {
    assert.throws(() => api.parseDiscoveryInput(value));
  }
  for (const url of ["javascript:alert(1)", "https://x.com/a", "https://foo.twitter.com/a", "http://[::1]/", "https://user:pass@blog.org/", "http://a.local/"]) assert.equal(api.publicBlogUrl(url), null);
  assert.equal(api.publicBlogUrl("https://blog.org/post?utm_source=x&id=1#hello"), "https://blog.org/post?id=1");
});

test("enforces deduplication, source diversity, article cap and reading budget", () => {
  const result = { articles: [article("https://seen.org/post"), article("https://blog.org/a"), article("https://blog.org/a?utm_source=x"), article("https://blog.org/b"), article("https://blog.org/c"), article("https://long.org/a", 40), ...Array.from({ length: 8 }, (_, i) => article(`https://blog${i}.org/a`))] };
  const articles = api.normalizeArticles(result, 20, new Set(["https://seen.org/post"]));
  assert.equal(articles.length, 5);
  assert.equal(articles.reduce((sum, a) => sum + a.minutes, 0), 20);
  assert.equal(articles.filter((a) => new URL(a.url).hostname === "blog.org").length, 2);
  assert.deepEqual(api.normalizeArticles({ articles: [] }, 20), []);
  assert.throws(() => api.normalizeArticles({ status: "failure" }, 20));
  assert.equal(api.normalizeArticles({ resultJson: JSON.stringify({ articles: [article("https://blog.org/a")] }) }, 10).length, 1);
});

test("bounded JSON rejects oversized streams without Content-Length", async () => {
  await assert.rejects(api.boundedJson(new Response(JSON.stringify({ data: "a".repeat(500) })), 100), /too large/);
});

test("unauthenticated requests and missing keys never call Tinyfish", async () => {
  const fetch = mock.method(globalThis, "fetch", () => { throw new Error("Unexpected network request"); });
  for (const method of ["GET", "POST", "PATCH"]) assert.equal((await api[method](req(method, method === "GET" ? undefined : input, null))).status, 401);
  delete process.env.TINYFISH_API_KEY;
  assert.equal((await api.POST(req("POST", input))).status, 503);
  assert.equal(fetch.mock.callCount(), 0);
});

test("concurrent starts create only one paid run; completion survives reload and cannot reroll", async () => {
  let starts = 0;
  mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).includes("run-async")) {
      starts++;
      const body = JSON.parse(options.body);
      assert.equal(body.output_schema.properties.articles.maxItems, 5);
      assert.equal(body.agent_config.max_duration_seconds, 300);
      assert.ok(options.headers["X-API-Key"]);
      return json({ run_id: "run-1" });
    }
    return json({ status: "COMPLETED", result: { articles: [article("https://one.org/a"), article("https://two.org/b")] } });
  });
  const startsResponses = await Promise.all([api.POST(req("POST", input)), api.POST(req("POST", input))]);
  assert.ok(startsResponses.every((r) => r.ok));
  assert.equal(starts, 1);
  const completed = await (await api.GET(req())).json();
  assert.equal(completed.digest.status, "ready");
  assert.equal(completed.digest.articles.length, 2);
  const reloaded = await (await api.GET(req())).json();
  assert.deepEqual(reloaded.digest, completed.digest);
  await api.POST(req("POST", { ...input, topics: "a new topic" }));
  assert.equal(starts, 1);
  assert.equal((await db.discoveryDigest.findFirst()).topics, input.topics);
});

test("native D1 completion rolls back the entire edition if an article insert fails", async () => {
  const digest = await db.discoveryDigest.create({ data: { userId: "reader", day: "2026-01-01", topics: "blogs", status: "running", runId: "atomic" } });
  const duplicate = article("https://one.org/a");
  await assert.rejects(api.completeDigest(digest.id, "atomic", [duplicate, duplicate]));
  assert.equal(await db.discoveryArticle.count(), 0);
  assert.equal((await db.discoveryDigest.findUnique({ where: { id: digest.id } })).status, "running");
});

test("transient polling errors preserve run ID and recover without a new crawl", async () => {
  mock.method(globalThis, "fetch", async (url) => String(url).includes("run-async") ? json({ run_id: "recover" }) : json({}, 503));
  await api.POST(req("POST", input));
  assert.equal((await api.GET(req())).status, 502);
  const digest = await db.discoveryDigest.findFirst();
  assert.equal(digest.status, "running");
  assert.equal(digest.runId, "recover");
  await db.discoveryDigest.update({ where: { id: digest.id }, data: { lastPolledAt: null } });
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => json({ status: "COMPLETED", result: { articles: [] } }));
  assert.equal((await (await api.GET(req())).json()).digest.status, "ready");
});

test("failed crawls permit only one explicit retry", async () => {
  let starts = 0;
  mock.method(globalThis, "fetch", async (url) => String(url).includes("run-async") ? (starts++, json({ run_id: `failed-${starts}` })) : json({ status: "FAILED", error: { code: "TASK_FAILED" } }));
  for (let i = 0; i < 3; i++) {
    await api.POST(req("POST", input));
    await api.GET(req());
  }
  assert.equal(starts, 2);
  assert.equal((await db.discoveryDigest.findFirst()).attempts, 2);
});

test("article state is owner-scoped, saved links are verified and read state persists", async () => {
  mock.method(globalThis, "fetch", async (url) => String(url).includes("run-async") ? json({ run_id: "owned" }) : json({ status: "COMPLETED", result: { articles: [article("https://one.org/a")] } }));
  await api.POST(req("POST", input));
  const view = await (await api.GET(req())).json();
  const id = view.digest.articles[0].id;
  assert.equal((await api.PATCH(req("PATCH", { id, status: "read" }, "other"))).status, 404);
  assert.equal((await (await api.GET(req("GET", undefined, "other"))).json()).digest, null);
  assert.equal((await api.PATCH(req("PATCH", { id, status: "saved" }))).status, 400);
  assert.equal((await api.PATCH(req("PATCH", { id, status: "read" }))).status, 200);
  assert.equal((await (await api.GET(req())).json()).digest.articles[0].status, "read");
});

test("RSS and Atom parsing handle CDATA, escaped text, invalid links and old posts", () => {
  const source = api.DISCOVERY_SOURCES.find((s) => s.id === "simon");
  const now = new Date("2026-09-07T01:00:00Z");
  const rss = `<rss><channel><item><title>Tools &amp; systems</title><link>https://example.org/post?utm_source=rss</link><pubDate>Sun, 06 Sep 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>A useful <b>explanation</b>.</p><script>bad()</script>]]></description></item><item><title>Old</title><link>https://example.org/old</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>`;
  const articles = api.parseFeed(rss, source, now);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].url, "https://example.org/post");
  assert.equal(articles[0].title, "Tools & systems");
  assert.equal(articles[0].excerpt, "A useful explanation.");
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>New</title><link rel="self" href="https://example.org/feed-entry"/><link rel="alternate" href="https://example.org/article"/><published>2026-09-06T12:00:00Z</published><summary>Readable</summary></entry></feed>`;
  assert.equal(api.parseFeed(atom, source, now)[0].url, "https://example.org/article");
  assert.throws(() => api.parseFeed("<html>Blocked</html>", source, now), /Not an RSS/);
});

test("daily preferences validate sources and remain private to their owner", async () => {
  assert.equal((await api.PUT(req("PUT", { enabled:true, sourceIds:["unknown"] }))).status, 400);
  assert.equal((await api.PUT(req("PUT", { enabled:true, sourceIds:["simon", "hn"] }))).status, 200);
  assert.equal((await (await api.GET(req())).json()).schedule.enabled, true);
  assert.equal((await (await api.GET(req("GET", undefined, "other"))).json()).schedule, null);
});

test("scheduler starts once across concurrent ticks and finishes without a page visit", async () => {
  const now = new Date("2026-09-07T01:00:00Z");
  await db.discoverySchedule.create({ data:{userId:"reader",enabled:true,topics:"AI tools",budget:20,sourceIds:'["simon"]'} });
  let starts = 0;
  mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("run-async")) { starts++; return json({run_id:"daily-run"}); }
    if (String(url).includes("/v1/runs/")) return json({status:"COMPLETED",result:{articles:[article("https://simonwillison.net/test-post")]}});
    return new Response(`<feed><entry><title>AI tools</title><link href="https://simonwillison.net/test-post"/><published>2026-09-06T12:00:00Z</published><summary>Practical tools</summary></entry></feed>`);
  });
  const env = { DB:globalThis.__discoveryTest.binding, TINYFISH_API_KEY:"test", CRON_SECRET:"test" };
  await Promise.all([api.runScheduledDiscovery(env,now),api.runScheduledDiscovery(env,now)]);
  assert.equal(starts,1);
  const digest = await db.discoveryDigest.findFirst();
  assert.equal(digest.origin,"scheduled");
  await api.runScheduledDiscovery(env,new Date("2026-09-07T01:05:00Z"));
  assert.equal((await db.discoveryDigest.findFirst()).status,"ready");
  assert.equal(await db.discoveryArticle.count(),1);
  assert.equal(starts,1);
  const schedule = await db.discoverySchedule.findFirst();
  assert.equal(schedule.lastRunAt.toISOString(),now.toISOString());
});

test("scheduler publishes attributed previews if Tinyfish fails and does not launch paid retries", async () => {
  await db.discoverySchedule.create({ data:{userId:"reader",enabled:true,topics:"AI tools",budget:20,sourceIds:'["simon","latent"]'} });
  let starts = 0;
  mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("run-async")) { starts++; return json({},503); }
    if (String(url).includes("latent.space")) return new Response("Unavailable",{status:503});
    return new Response(`<rss><channel><item><title>Tools</title><link>https://simonwillison.net/test-post</link><pubDate>Sun, 06 Sep 2026 12:00:00 GMT</pubDate><description>A public preview</description></item></channel></rss>`);
  });
  const env = { DB:globalThis.__discoveryTest.binding, TINYFISH_API_KEY:"test", CRON_SECRET:"test" };
  await api.runScheduledDiscovery(env,new Date("2026-09-07T01:00:00Z"));
  const digest = await db.discoveryDigest.findFirst({include:{articles:true}});
  assert.equal(digest.status,"ready");
  assert.match(digest.articles[0].summary,/Publisher preview/);
  assert.match(digest.articles[0].reason,/not an AI-verified summary/);
  assert.ok(JSON.parse((await db.discoverySchedule.findFirst()).sourceHealth).some(s=>s.id==="latent" && s.error));
  await api.runScheduledDiscovery(env,new Date("2026-09-07T02:00:00Z"));
  assert.equal(starts,1);
});

test("scheduler honors pause, start time, existing editions, and stale-start recovery", async () => {
  const env = { DB:globalThis.__discoveryTest.binding, TINYFISH_API_KEY:"test", CRON_SECRET:"test" };
  const fetch = mock.method(globalThis,"fetch",()=>{throw new Error("Unexpected fetch");});
  await db.discoverySchedule.create({data:{userId:"reader",enabled:false,topics:"tools",budget:20,sourceIds:'["simon"]'}});
  await api.runScheduledDiscovery(env,new Date("2026-09-07T01:00:00Z"));
  assert.equal(await db.discoveryDigest.count(),0);
  await db.discoverySchedule.update({where:{userId:"reader"},data:{enabled:true}});
  await api.runScheduledDiscovery(env,new Date("2026-09-07T00:15:00Z"));
  assert.equal(await db.discoveryDigest.count(),0);
  await db.discoveryDigest.create({data:{userId:"reader",day:"2026-09-07",topics:"tools",origin:"scheduled",startedAt:new Date("2026-09-07T01:00:00Z")}});
  await api.runScheduledDiscovery(env,new Date("2026-09-07T01:10:00Z"));
  assert.equal((await db.discoveryDigest.findFirst()).status,"ready");
  assert.equal(fetch.mock.callCount(),0);
});
