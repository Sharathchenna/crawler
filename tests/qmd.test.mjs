import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { createRequire } from "node:module";

let qmd;
let scratch;

before(async () => {
  scratch = await mkdtemp(path.resolve("node_modules/.qmd-test-"));
  const outfile = path.join(scratch, "qmd.cjs");
  await build({
    entryPoints: ["lib/qmd.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
  });
  qmd = createRequire(import.meta.url)(outfile);
});

after(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

test("buildFtsQuery sanitizes specials and keeps recall ORs", () => {
  assert.equal(qmd.buildFtsQuery(""), null);
  assert.equal(qmd.buildFtsQuery("a"), null);
  const q = qmd.buildFtsQuery("auth middleware");
  assert.ok(q.includes("OR"), `expected OR recall, got ${q}`);
  assert.ok(!q.includes("(") || q.includes('"'), q);
  // Specials from the raw input must not leak as FTS5 operators.
  const tricky = qmd.buildFtsQuery("hello(world):^test");
  assert.ok(tricky && !tricky.includes("(") && !tricky.includes(")") && !tricky.includes("^") && !tricky.includes(":"), tricky);
});

test("tokenizeQuery drops stop chars and caps terms", () => {
  assert.deepEqual(qmd.tokenizeQuery("  "), []);
  const terms = qmd.tokenizeQuery("a an the auth login flow extra words here more");
  assert.ok(terms.length <= 8);
  assert.ok(terms.includes("auth"));
});

test("normalizeCjkForFts spaces CJK runs", () => {
  const out = qmd.normalizeCjkForFts("hello世界test");
  assert.ok(out.includes("世 界"), out);
});

test("rrfFuse weights first list 2x and rewards rank 1", () => {
  const scores = qmd.rrfFuse([
    { ids: ["a", "b"], weight: 2 },
    { ids: ["b", "a"], weight: 1 },
  ]);
  // a is rank-1 in the 2x list, b is rank-1 in the 1x list: a must win.
  assert.ok(scores.get("a") > scores.get("b"));
  const ranked = qmd.rankByFusion(scores);
  assert.deepEqual(ranked, ["a", "b"]);
});

test("extractSnippet finds the term window", () => {
  const body = `${"filler ".repeat(50)} authentication flow ${"trailer ".repeat(50)}`;
  const snippet = qmd.extractSnippet("Title", "excerpt", body, "authentication");
  assert.ok(snippet.toLowerCase().includes("authentication"), snippet);
  assert.ok(snippet.length <= 300, snippet);
});

test("ftsSearch maps rows and propagates missing-table errors", async () => {
  const calls = [];
  const fakeDb = {
    prepare: (sql) => ({
      bind: (...args) => ({
        all: async () => {
          calls.push({ sql, args });
          return { results: [{ id: "a", rank: -1.5 }, { id: "", rank: 0 }, { id: "b", rank: -0.5 }] };
        },
      }),
    }),
  };
  const hits = await qmd.ftsSearch(fakeDb, "items_fts", "u1", '"auth"', 10);
  assert.deepEqual(hits.map((h) => h.id), ["a", "b"]);
  assert.ok(calls[0].sql.includes('bm25("items_fts"'), calls[0].sql);
  assert.deepEqual(calls[0].args, ['"auth"', "u1", 10]);

  const missing = { prepare: () => ({ bind: () => ({ all: async () => { throw new Error("no such table"); } }) }) };
  await assert.rejects(qmd.ftsSearch(missing, "items_fts", "u1", '"auth"'), /no such table/);
});
