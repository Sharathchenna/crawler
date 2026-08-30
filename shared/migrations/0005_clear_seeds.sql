-- Drop placeholder catalog rows inserted by 0002 and 0004.

DELETE FROM crawl_jobs WHERE url IN (
  SELECT url FROM posts WHERE created_at = 1756560000000
);

DELETE FROM posts WHERE created_at = 1756560000000;
