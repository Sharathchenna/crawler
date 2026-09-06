ALTER TABLE discovery_digests ADD COLUMN slot INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "discovery_digests_userId_day_key";
CREATE UNIQUE INDEX IF NOT EXISTS "discovery_digests_userId_day_slot_key" ON "discovery_digests"("userId", "day", "slot");
