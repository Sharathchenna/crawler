-- Add shelf type for blogs, papers, tweets, HN, and anything else.

ALTER TABLE posts ADD COLUMN content_type TEXT NOT NULL DEFAULT 'blog';

CREATE INDEX IF NOT EXISTS idx_posts_content_type ON posts (content_type);

UPDATE posts SET content_type = 'hn' WHERE discovered_via = 'hn';
UPDATE posts SET content_type = 'blog' WHERE discovered_via IN ('seed', 'tinyfish', 'expand') AND content_type = 'blog';
