PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL,
  name TEXT,
  avatar TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  theme TEXT NOT NULL DEFAULT 'system',
  token_encrypted TEXT,
  scopes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_method TEXT NOT NULL DEFAULT 'oauth',
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE repositories (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE feed_cache (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX feed_cache_expiry ON feed_cache(expires_at);
CREATE TABLE star_snapshots (
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  stars INTEGER NOT NULL,
  PRIMARY KEY (repo_id, day)
);
CREATE TABLE saved_repositories (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, repo_id)
);
CREATE TABLE browsing_history (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, repo_id)
);
CREATE TABLE dismissed_repositories (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  dismissed_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, repo_id)
);
CREATE INDEX saved_order ON saved_repositories(user_id, saved_at DESC, repo_id DESC);
CREATE INDEX history_order ON browsing_history(user_id, viewed_at DESC, repo_id DESC);
