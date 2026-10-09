import type { Repository } from "@/types";

export interface Taste {
  languages: Record<string, number>;
  topics: Record<string, number>;
  negative: Record<string, number>;
}
export const emptyTaste = (): Taste => ({
  languages: {},
  topics: {},
  negative: {},
});
export function addTaste(
  taste: Taste,
  repo: Repository,
  weight: number,
  negative = false,
) {
  if (repo.language && !negative)
    taste.languages[repo.language] =
      (taste.languages[repo.language] ?? 0) + weight;
  const target = negative ? taste.negative : taste.topics;
  for (const topic of repo.topics)
    target[topic] =
      (target[topic] ?? 0) +
      weight / Math.sqrt(Math.max(1, repo.topics.length));
}
export function topSignals(values: Record<string, number>, limit = 3) {
  return Object.entries(values)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}
function strength(values: Record<string, number>, name: string) {
  return (values[name] ?? 0) / Math.max(1, ...Object.values(values));
}
// Stable seeded noise within a batch; a new batch deliberately gets a new seed.
export function jitter(seed: string, id: number) {
  let h = 2166136261;
  for (const c of `${seed}:${id}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
export function rankRecommendations(
  candidates: Repository[],
  taste: Taste,
  excluded: Set<number>,
  seed: string,
  now = Date.now(),
) {
  const scores = new Map<number, number>();
  const pool = [
    ...new Map(
      candidates.filter((r) => !excluded.has(r.id)).map((r) => [r.id, r]),
    ).values(),
  ];
  for (const repo of pool) {
    const language = repo.language
      ? strength(taste.languages, repo.language)
      : 0;
    const topic = Math.min(
      1.5,
      repo.topics.reduce((n, t) => n + strength(taste.topics, t), 0),
    );
    const negative = Math.min(
      2,
      repo.topics.reduce((n, t) => n + strength(taste.negative, t), 0),
    );
    const age = Math.max(0, (now - Date.parse(repo.updatedAt)) / 86400000);
    const createdAge = Math.max(
      0,
      (now - Date.parse(repo.createdAt)) / 86400000,
    );
    const quality = Math.min(1, Math.log10(Math.max(1, repo.stars)) / 3);
    const famous =
      repo.stars > 10000 ? Math.log10(repo.stars / 10000 + 1) * 2 : 0;
    scores.set(
      repo.id,
      3 * language +
        3 * topic -
        3 * negative +
        1.2 * Math.exp(-age / 120) +
        0.7 * Math.exp(-createdAge / 180) +
        0.5 * quality -
        famous +
        2 * jitter(seed, repo.id),
    );
  }
  const result: Repository[] = [];
  // Bound greedy reranking CPU on Workers, rather than reranking the full cache.
  pool.sort((a, b) => scores.get(b.id)! - scores.get(a.id)!);
  pool.splice(600);
  const owners = new Map<string, number>();
  while (pool.length) {
    let best = 0,
      score = -Infinity;
    const recent = result.slice(-4);
    for (let i = 0; i < pool.length; i++) {
      const repo = pool[i];
      const similar = recent.reduce(
        (n, prev) =>
          n +
          (prev.language && prev.language === repo.language ? 0.65 : 0) +
          Math.min(
            0.8,
            prev.topics.filter((t) => repo.topics.includes(t)).length * 0.25,
          ),
        0,
      );
      // Every fifth place explores beyond the strongest stack, without abandoning quality.
      const exploration =
        result.length % 5 === 4
          ? 2 *
            (1 - (repo.language ? strength(taste.languages, repo.language) : 0))
          : 0;
      const adjusted =
        scores.get(repo.id)! -
        similar -
        (owners.get(repo.owner) ?? 0) * 2.5 +
        exploration;
      if (adjusted > score) {
        score = adjusted;
        best = i;
      }
    }
    const [repo] = pool.splice(best, 1);
    result.push(repo);
    owners.set(repo.owner, (owners.get(repo.owner) ?? 0) + 1);
  }
  return result;
}
