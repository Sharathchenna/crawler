-- Hoard demo seed: demo@hoard.local / password
-- Apply AFTER db/migrations/0001_init.sql. Safe to run once (fixed ids).
-- Password is PBKDF2-HMAC-SHA256 ($pbkdf2$ format, see lib/auth.ts).

INSERT INTO users (id, email, password, plan, createdAt) VALUES
('seed-user-demo', 'demo@hoard.local', 'managed-by-access', 'personal', '2026-09-05T12:00:00.000Z');

INSERT INTO tags (id, userId, name) VALUES
('seed-tag-reading', 'seed-user-demo', 'reading'),
('seed-tag-ideas', 'seed-user-demo', 'ideas');

INSERT INTO items (id, userId, type, title, sourceUrl, markdown, excerpt, status, createdAt) VALUES
('seed-item-memory', 'seed-user-demo', 'page', 'The design of everyday memory', 'https://example.com/everyday-memory', '# The design of everyday memory

[Original](https://example.com/everyday-memory)

Tools that remember for us should be boring and fast. Capture first, organize later.', 'Tools that remember for us should be boring and fast.', 'saved', '2026-09-05T12:00:00.000Z'),
('seed-item-models', 'seed-user-demo', 'x', 'Thread: small models, big context', 'https://x.com/example/status/123', '# Thread: small models, big context

[Original](https://x.com/example/status/123)

1/ Give the model your notes, not the internet.
2/ Markdown beats screenshots.
3/ Search is the UI.', 'Give the model your notes, not the internet.', 'inbox', '2026-09-05T12:00:00.000Z'),
('seed-item-methods', 'seed-user-demo', 'pdf', 'Field notes — research methods (PDF)', 'https://example.com/methods.pdf', '# Field notes — research methods

[Original](https://example.com/methods.pdf)

_Write your own summary here after importing the PDF._', 'Imported PDF placeholder with room for your summary.', 'saved', '2026-09-05T12:00:00.000Z'),
('seed-item-capture', 'seed-user-demo', 'video', 'Why capture beats curation', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '# Why capture beats curation

[Original](https://www.youtube.com/watch?v=dQw4w9WgXcQ)

Key idea: saving is cheap, refinding is the product.', 'Saving is cheap, refinding is the product.', 'inbox', '2026-09-05T12:00:00.000Z'),
('seed-item-voice', 'seed-user-demo', 'note', 'Voice memo: launch checklist', NULL, '# Voice memo: launch checklist

- Ship capture first
- Search second
- Sync third', 'Ship capture first, search second, sync third.', 'saved', '2026-09-05T12:00:00.000Z'),
('seed-item-markdown', 'seed-user-demo', 'page', 'Markdown as an API', 'https://example.com/markdown-api', '# Markdown as an API

[Original](https://example.com/markdown-api)

If an agent can read it and write it, it is an interface. Markdown is the interface.', 'If an agent can read it and write it, it is an interface.', 'inbox', '2026-09-05T12:00:00.000Z');

INSERT INTO item_tags (itemId, tagId) VALUES
('seed-item-memory', 'seed-tag-reading'),
('seed-item-models', 'seed-tag-ideas'),
('seed-item-methods', 'seed-tag-reading'),
('seed-item-voice', 'seed-tag-ideas'),
('seed-item-markdown', 'seed-tag-reading'),
('seed-item-markdown', 'seed-tag-ideas');

INSERT INTO notes (id, userId, title, markdown, project, kind, createdAt, updatedAt) VALUES
('seed-note-launch', 'seed-user-demo', 'Hoard launch notes', '# Hoard launch notes

## v3

Ship MCP + CLI + Share Extension. Web reader is clean.

## v2

Added revisions. Every save keeps history.

## v1

Capture works. Library lists everything.', 'hoard', 'project', '2026-09-05T12:00:00.000Z', '2026-09-05T12:00:00.000Z');

INSERT INTO note_revisions (id, noteId, version, author, summary, markdown, createdAt) VALUES
('seed-rev-1', 'seed-note-launch', 1, 'You', 'First capture notes', '# Hoard launch notes

Capture works. Library lists everything.', '2026-09-05T12:00:00.000Z'),
('seed-rev-2', 'seed-note-launch', 2, 'You', 'Added revision history', '# Hoard launch notes

Added revisions. Every save keeps history.', '2026-09-05T12:00:00.000Z'),
('seed-rev-3', 'seed-note-launch', 3, 'You', 'MCP + CLI plan', '# Hoard launch notes

Ship MCP + CLI + Share Extension. Web reader is clean.', '2026-09-05T12:00:00.000Z');

INSERT INTO note_sources (noteId, itemId) VALUES
('seed-note-launch', 'seed-item-memory');
