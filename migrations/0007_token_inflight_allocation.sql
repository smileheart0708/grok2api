-- Token inflight reservation state for high-concurrency allocation.

ALTER TABLE tokens ADD COLUMN inflight_chat INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN inflight_heavy INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN inflight_updated_at INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS token_usage_probe_window (
  token TEXT PRIMARY KEY,
  last_probed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_usage_probe_window_last_probed_at
  ON token_usage_probe_window(last_probed_at);
