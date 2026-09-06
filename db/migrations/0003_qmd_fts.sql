-- qmd-style BM25 full-text index (FTS5, porter unicode61).
-- Standalone tables (not external-content) so old DBs and fresh DBs converge.
-- Triggers keep the index in sync; Prisma never touches these tables directly.
-- Title is boosted at query time via bm25(table, 2.0, 1.0).

CREATE VIRTUAL TABLE IF NOT EXISTS "items_fts" USING fts5(
  id UNINDEXED, userId UNINDEXED, title, body,
  tokenize='porter unicode61'
);
CREATE VIRTUAL TABLE IF NOT EXISTS "notes_fts" USING fts5(
  id UNINDEXED, userId UNINDEXED, title, body,
  tokenize='porter unicode61'
);

DROP TRIGGER IF EXISTS "items_fts_ai";
CREATE TRIGGER "items_fts_ai" AFTER INSERT ON "items" BEGIN
  INSERT INTO "items_fts"(id, userId, title, body)
  VALUES (new."id", new."userId", new."title", new."title" || ' ' || new."excerpt" || ' ' || substr(new."markdown", 1, 20000));
END;

DROP TRIGGER IF EXISTS "items_fts_ad";
CREATE TRIGGER "items_fts_ad" AFTER DELETE ON "items" BEGIN
  DELETE FROM "items_fts" WHERE id = old."id";
END;

DROP TRIGGER IF EXISTS "items_fts_au";
CREATE TRIGGER "items_fts_au" AFTER UPDATE ON "items" BEGIN
  DELETE FROM "items_fts" WHERE id = old."id";
  INSERT INTO "items_fts"(id, userId, title, body)
  VALUES (new."id", new."userId", new."title", new."title" || ' ' || new."excerpt" || ' ' || substr(new."markdown", 1, 20000));
END;

DROP TRIGGER IF EXISTS "notes_fts_ai";
CREATE TRIGGER "notes_fts_ai" AFTER INSERT ON "notes" BEGIN
  INSERT INTO "notes_fts"(id, userId, title, body)
  VALUES (new."id", new."userId", new."title", new."title" || ' ' || substr(new."markdown", 1, 20000));
END;

DROP TRIGGER IF EXISTS "notes_fts_ad";
CREATE TRIGGER "notes_fts_ad" AFTER DELETE ON "notes" BEGIN
  DELETE FROM "notes_fts" WHERE id = old."id";
END;

DROP TRIGGER IF EXISTS "notes_fts_au";
CREATE TRIGGER "notes_fts_au" AFTER UPDATE ON "notes" BEGIN
  DELETE FROM "notes_fts" WHERE id = old."id";
  INSERT INTO "notes_fts"(id, userId, title, body)
  VALUES (new."id", new."userId", new."title", new."title" || ' ' || substr(new."markdown", 1, 20000));
END;

-- Backfill (idempotent): rebuild from current rows.
DELETE FROM "items_fts";
INSERT INTO "items_fts"(id, userId, title, body)
  SELECT "id", "userId", "title", "title" || ' ' || "excerpt" || ' ' || substr("markdown", 1, 20000) FROM "items";
DELETE FROM "notes_fts";
INSERT INTO "notes_fts"(id, userId, title, body)
  SELECT "id", "userId", "title", "title" || ' ' || substr("markdown", 1, 20000) FROM "notes";
