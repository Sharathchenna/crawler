CREATE TABLE IF NOT EXISTS "discovery_digests" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "topics" TEXT NOT NULL,
  "seeds" TEXT NOT NULL DEFAULT '[]',
  "budget" INTEGER NOT NULL DEFAULT 20,
  "status" TEXT NOT NULL DEFAULT 'starting',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "runId" TEXT,
  "error" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastPolledAt" DATETIME,
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "discovery_digests_userId_day_key" ON "discovery_digests"("userId", "day");

CREATE TABLE IF NOT EXISTS "discovery_articles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "digestId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unread',
  FOREIGN KEY ("digestId") REFERENCES "discovery_digests"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "discovery_articles_digestId_url_key" ON "discovery_articles"("digestId", "url");
