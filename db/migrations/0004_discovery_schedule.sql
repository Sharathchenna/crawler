ALTER TABLE discovery_digests ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE discovery_digests ADD COLUMN candidates TEXT NOT NULL DEFAULT '[]';
CREATE TABLE discovery_schedules (
  userId TEXT NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  topics TEXT NOT NULL,
  budget INTEGER NOT NULL DEFAULT 30,
  sourceIds TEXT NOT NULL,
  lastRunAt DATETIME,
  lastError TEXT,
  sourceHealth TEXT NOT NULL DEFAULT '[]'
);
