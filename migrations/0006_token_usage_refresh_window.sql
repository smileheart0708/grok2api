-- Delayed token usage refresh dedup window state (Cloudflare Queues).

CREATE TABLE IF NOT EXISTS token_usage_refresh_window (
  token TEXT PRIMARY KEY,
  last_enqueued_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_usage_refresh_window_last_enqueued_at
  ON token_usage_refresh_window(last_enqueued_at);
