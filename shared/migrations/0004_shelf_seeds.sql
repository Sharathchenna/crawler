-- Sample papers, tweets, HN, and other links so every shelf has something.

INSERT OR IGNORE INTO sources (domain, kind, last_crawled) VALUES
  ('arxiv.org', 'personal', 0),
  ('x.com', 'personal', 0),
  ('simonwillison.net', 'personal', 0),
  ('github.com', 'personal', 0);

INSERT OR IGNORE INTO posts (
  url, canonical_url, source_id, title, excerpt, site, topic, content_type,
  published_at, word_count, score, r2_key, discovered_via, created_at
) VALUES
(
  'https://arxiv.org/abs/1706.03762',
  'https://arxiv.org/abs/1706.03762',
  (SELECT id FROM sources WHERE domain = 'arxiv.org'),
  'Attention Is All You Need',
  'The Transformer dispenses with recurrence and convolutions entirely, relying on self-attention to draw global dependencies between input and output.',
  'arxiv.org',
  'engineering',
  'paper',
  1497225600000,
  4200,
  99,
  NULL,
  'arxiv',
  1756560000000
),
(
  'https://arxiv.org/abs/2005.14165',
  'https://arxiv.org/abs/2005.14165',
  (SELECT id FROM sources WHERE domain = 'arxiv.org'),
  'Language Models are Few-Shot Learners',
  'Scaling up language models greatly improves task-agnostic, few-shot performance, evaluated across more than two dozen NLP datasets.',
  'arxiv.org',
  'engineering',
  'paper',
  1590624000000,
  8900,
  97,
  NULL,
  'arxiv',
  1756560000000
),
(
  'https://x.com/karpathy/status/1733291372188994851',
  'https://x.com/karpathy/status/1733291372188994851',
  (SELECT id FROM sources WHERE domain = 'x.com'),
  'Tweet by @karpathy',
  'https://x.com/karpathy/status/1733291372188994851',
  'x.com',
  'engineering',
  'tweet',
  1701993600000,
  0,
  84,
  NULL,
  'saved',
  1756560000000
),
(
  'https://simonwillison.net/2023/Apr/12/code-interpreter',
  'https://simonwillison.net/2023/Apr/12/code-interpreter',
  (SELECT id FROM sources WHERE domain = 'simonwillison.net'),
  'ChatGPT Code Interpreter is a game changer',
  'A Hacker News favorite: Code Interpreter turns ChatGPT into a working data analyst, with Python in a sandbox and files you can actually download.',
  'simonwillison.net',
  'engineering',
  'hn',
  1681257600000,
  2100,
  92,
  NULL,
  'hn',
  1756560000000
),
(
  'https://github.com/karpathy/nanoGPT',
  'https://github.com/karpathy/nanoGPT',
  (SELECT id FROM sources WHERE domain = 'github.com'),
  'nanoGPT',
  'The simplest, fastest repository for training/finetuning medium-sized GPTs. A link worth keeping even when it is not a blog post.',
  'github.com',
  'engineering',
  'other',
  1672185600000,
  400,
  90,
  NULL,
  'saved',
  1756560000000
);
