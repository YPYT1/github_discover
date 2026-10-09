CREATE TABLE operation_leases (
  key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX operation_leases_expiry ON operation_leases(expires_at);
CREATE TABLE operation_status (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE operation_alerts (
  code TEXT PRIMARY KEY,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  count INTEGER NOT NULL,
  resolved_at INTEGER
);
