CREATE TABLE recommendation_seen (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, repo_id)
);
CREATE INDEX recommendation_seen_user ON recommendation_seen(user_id, seen_at DESC);
