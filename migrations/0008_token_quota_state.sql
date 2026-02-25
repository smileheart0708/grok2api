-- Token quota state (rate_limit_model granularity) + audit + dedup windows

CREATE TABLE IF NOT EXISTS token_quota_state (
  token TEXT NOT NULL,
  rate_limit_model TEXT NOT NULL,
  remaining_tokens INTEGER,
  total_tokens INTEGER,
  remaining_queries INTEGER,
  total_queries INTEGER,
  low_effort_cost INTEGER,
  high_effort_cost INTEGER,
  window_size_seconds INTEGER,
  metric_kind TEXT NOT NULL DEFAULT 'unknown',
  source TEXT NOT NULL DEFAULT 'unknown',
  refreshed_at INTEGER NOT NULL,
  success INTEGER NOT NULL DEFAULT 1,
  last_error TEXT NOT NULL DEFAULT '',
  raw_payload TEXT NOT NULL DEFAULT '{}',
  inflight_units INTEGER NOT NULL DEFAULT 0,
  inflight_updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (token, rate_limit_model)
);

CREATE INDEX IF NOT EXISTS idx_token_quota_state_token
  ON token_quota_state(token);
CREATE INDEX IF NOT EXISTS idx_token_quota_state_rate_model
  ON token_quota_state(rate_limit_model);
CREATE INDEX IF NOT EXISTS idx_token_quota_state_refreshed_at
  ON token_quota_state(refreshed_at);

CREATE TABLE IF NOT EXISTS token_quota_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  rate_limit_model TEXT NOT NULL,
  remaining_tokens INTEGER,
  total_tokens INTEGER,
  remaining_queries INTEGER,
  total_queries INTEGER,
  low_effort_cost INTEGER,
  high_effort_cost INTEGER,
  window_size_seconds INTEGER,
  metric_kind TEXT NOT NULL DEFAULT 'unknown',
  source TEXT NOT NULL DEFAULT 'unknown',
  refreshed_at INTEGER NOT NULL,
  success INTEGER NOT NULL DEFAULT 1,
  last_error TEXT NOT NULL DEFAULT '',
  raw_payload TEXT NOT NULL DEFAULT '{}',
  recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_quota_audit_token
  ON token_quota_audit(token);
CREATE INDEX IF NOT EXISTS idx_token_quota_audit_rate_model
  ON token_quota_audit(rate_limit_model);
CREATE INDEX IF NOT EXISTS idx_token_quota_audit_recorded_at
  ON token_quota_audit(recorded_at);

CREATE TABLE IF NOT EXISTS token_quota_refresh_window (
  token TEXT NOT NULL,
  rate_limit_model TEXT NOT NULL,
  last_enqueued_at INTEGER NOT NULL,
  PRIMARY KEY (token, rate_limit_model)
);

CREATE INDEX IF NOT EXISTS idx_token_quota_refresh_window_last_enqueued_at
  ON token_quota_refresh_window(last_enqueued_at);

CREATE TABLE IF NOT EXISTS token_quota_probe_window (
  token TEXT NOT NULL,
  rate_limit_model TEXT NOT NULL,
  last_probed_at INTEGER NOT NULL,
  PRIMARY KEY (token, rate_limit_model)
);

CREATE INDEX IF NOT EXISTS idx_token_quota_probe_window_last_probed_at
  ON token_quota_probe_window(last_probed_at);
