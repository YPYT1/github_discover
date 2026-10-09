import { post } from "./client";

const key = (userId?: number) => `discover_seen:${userId ?? "anonymous"}`;
const pendingKey = (userId: number) => `discover_seen_pending:${userId}`;
// Storage errors are surfaced by callers: don't silently claim persistence.
export function seenIds(userId?: number): number[] {
  const value: unknown = JSON.parse(localStorage.getItem(key(userId)) ?? "[]");
  return Array.isArray(value)
    ? value.filter((id) => Number.isSafeInteger(id) && id > 0)
    : [];
}
export function markSeen(id: number, userId?: number) {
  const ids = new Set(seenIds(userId));
  if (ids.has(id)) return;
  if (userId) {
    const pending: number[] = JSON.parse(
      localStorage.getItem(pendingKey(userId)) ?? "[]",
    );
    localStorage.setItem(
      pendingKey(userId),
      JSON.stringify([...new Set([...pending, id])]),
    );
  }
  ids.add(id);
  localStorage.setItem(key(userId), JSON.stringify([...ids]));
}
const inflight = new Map<number, Promise<void>>();
export function flushSeen(userId?: number): Promise<void> {
  if (!userId) return Promise.resolve();
  const existing = inflight.get(userId);
  if (existing) return existing;
  const work = (async () => {
    for (;;) {
      const pending: number[] = JSON.parse(
        localStorage.getItem(pendingKey(userId)) ?? "[]",
      );
      if (!pending.length) return;
      const batch = pending.slice(0, 100);
      await post("/api/me/seen", { ids: batch, userId });
      // Preserve exposures added while the request was in flight.
      const latest: number[] = JSON.parse(
        localStorage.getItem(pendingKey(userId)) ?? "[]",
      );
      const sent = new Set(batch);
      localStorage.setItem(
        pendingKey(userId),
        JSON.stringify(latest.filter((id) => !sent.has(id))),
      );
    }
  })();
  inflight.set(userId, work);
  void work.finally(() => inflight.delete(userId)).catch(() => {});
  return work;
}
