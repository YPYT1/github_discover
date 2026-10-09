import { hashToken } from "./crypto";
export type AlertCode =
  "syncFailed" | "syncPartial" | "quotaLow" | "tokenMissing";
export async function alert(db: D1Database, code: AlertCode) {
  const now = Date.now();
  // One aggregate row per known alert code, not an access-log table.
  await db
    .prepare(
      `INSERT INTO operation_alerts(code,first_at,last_at,count) VALUES(?,?,?,1)
    ON CONFLICT(code) DO UPDATE SET last_at=excluded.last_at,count=operation_alerts.count+1,resolved_at=NULL`,
    )
    .bind(code, now, now)
    .run();
}
export async function resolveAlert(db: D1Database, code: AlertCode) {
  await db
    .prepare(
      "UPDATE operation_alerts SET resolved_at=? WHERE code=? AND resolved_at IS NULL",
    )
    .bind(Date.now(), code)
    .run();
}
export async function acquireLease(db: D1Database, key: string, ttl = 45000) {
  const owner = crypto.randomUUID();
  const result = await db
    .prepare(
      `INSERT INTO operation_leases(key,owner,expires_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE operation_leases.expires_at<=? RETURNING owner`,
    )
    .bind(key, owner, Date.now() + ttl, Date.now())
    .first<{ owner: string }>();
  return result?.owner === owner ? owner : null;
}
export async function releaseLease(db: D1Database, key: string, owner: string) {
  await db
    .prepare("DELETE FROM operation_leases WHERE key=? AND owner=?")
    .bind(key, owner)
    .run();
}
export async function status(
  db: D1Database,
  key: string,
  data: Record<string, unknown>,
) {
  await db
    .prepare(
      "INSERT OR REPLACE INTO operation_status(key,data,updated_at) VALUES(?,?,?)",
    )
    .bind(key, JSON.stringify(data), Date.now())
    .run();
}
export async function collectorKey(token?: string) {
  return `quota:${token ? await hashToken(token) : "anonymous"}`;
}
