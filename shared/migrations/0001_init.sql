-- D1 schema for Parchment catalog

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('company_blog', 'hn', 'essay', 'personal')),
  last_crawled INTEGER
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  canonical_url TEXT NOT NULL UNIQUE,
  source_id INTEGER REFERENCES sources(id),
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  site TEXT NOT NULL,
  topic TEXT NOT NULL,
  published_at INTEGER,
  word_count INTEGER NOT NULL,
  score REAL NOT NULL,
  r2_key TEXT,
  discovered_via TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_score ON posts (score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_source ON posts (source_id);
CREATE INDEX IF NOT EXISTS idx_posts_topic ON posts (topic);

CREATE TABLE IF NOT EXISTS crawl_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'fetching', 'done', 'skipped', 'error')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs (status, updated_at);
