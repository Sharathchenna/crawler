INSERT INTO sources (domain, kind, last_crawled) VALUES
  ('paulgraham.com', 'essay', 0),
  ('stripe.com', 'company_blog', 0),
  ('blog.cloudflare.com', 'company_blog', 0),
  ('jvns.ca', 'personal', 0),
  ('figma.com', 'company_blog', 0);

INSERT INTO posts (
  url, canonical_url, source_id, title, excerpt, site, topic,
  published_at, word_count, score, r2_key, discovered_via, created_at
) VALUES
(
  'https://paulgraham.com/ds.html',
  'https://paulgraham.com/ds.html',
  1,
  'Do Things That Don''t Scale',
  'The most common unscalable thing founders have to do at the start is to recruit users manually. You can''t wait for users to come to you. You have to go out and get them.',
  'paulgraham.com',
  'essays',
  1372636800000,
  4200,
  96,
  NULL,
  'seed',
  1756560000000
),
(
  'https://stripe.com/blog/ending-the-ice-age',
  'https://stripe.com/blog/ending-the-ice-age',
  2,
  'Ending the Ice Age of Internet Payments',
  'Payments on the internet used to feel frozen in place: brittle APIs, leaky abstractions, and weeks of integration work. The best company writing explains the thaw — and why developer experience became the product.',
  'stripe.com',
  'engineering',
  1615766400000,
  2800,
  91,
  NULL,
  'seed',
  1756560000000
),
(
  'https://blog.cloudflare.com/the-network-is-the-computer',
  'https://blog.cloudflare.com/the-network-is-the-computer',
  3,
  'The Network Is the Computer',
  'When compute moves to the edge, the interesting questions stop being about servers and start being about isolation, scheduling, and what a request is allowed to remember.',
  'blog.cloudflare.com',
  'engineering',
  1663632000000,
  3100,
  89,
  NULL,
  'seed',
  1756560000000
),
(
  'https://jvns.ca/blog/2018/09/06/debugging-stories',
  'https://jvns.ca/blog/2018/09/06/debugging-stories',
  4,
  'Debugging Stories',
  'The most generous engineering writing is a walk through being stuck: the false lead, the tool that lied, and the one log line that finally made the system confess.',
  'jvns.ca',
  'engineering',
  1536192000000,
  1900,
  93,
  NULL,
  'seed',
  1756560000000
),
(
  'https://www.figma.com/blog/how-figma-designs-collaboration',
  'https://www.figma.com/blog/how-figma-designs-collaboration',
  5,
  'Designing for Many Cursors in One File',
  'Multiplayer design tools fail in the seams: selection, conflict, and the feeling that someone else just moved your work. The best writing on this is almost systems engineering in disguise.',
  'figma.com',
  'design',
  1684368000000,
  2600,
  88,
  NULL,
  'seed',
  1756560000000
);
