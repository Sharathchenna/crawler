-- Per-link reactions. Like / pass / read all send a card to Archive
-- so live shelves stay fresh. Like and pass also steer Suggested ranking.

CREATE TABLE IF NOT EXISTS reactions (
  post_id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('like', 'dislike', 'read')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reactions_kind ON reactions (kind, created_at DESC);
