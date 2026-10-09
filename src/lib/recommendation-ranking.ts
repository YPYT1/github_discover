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
function normalized(values: Record<string, number>) {
  const maximum = Math.max(1, ...Object.values(values));
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, value / maximum]),
  );
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
  // Normalize once, not once per candidate/topic and again inside greedy reranking.
  const languages = normalized(taste.languages);
  const topics = normalized(taste.topics);
  const negatives = normalized(taste.negative);
  const scores = new Map<number, number>();
  const pool = [
    ...new Map(
      candidates.filter((r) => !excluded.has(r.id)).map((r) => [r.id, r]),
    ).values(),
  ];
  for (const repo of pool) {
    const language = repo.language ? (languages[repo.language] ?? 0) : 0;
    const topic = Math.min(
      1.5,
      repo.topics.reduce((n, t) => n + (topics[t] ?? 0), 0),
    );
    const negative = Math.min(
      2,
      repo.topics.reduce((n, t) => n + (negatives[t] ?? 0), 0),
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
  const chosen = new Uint8Array(pool.length);
  const recentPenalty = new Float64Array(pool.length);
  const ownerPenalty = new Float64Array(pool.length);
  const base = pool.map((repo) => scores.get(repo.id)!);
  const exploration = pool.map(
    (repo) => 2 * (1 - (repo.language ? (languages[repo.language] ?? 0) : 0)),
  );
  const ownerIndex = new Map<string, number[]>();
  const languageIndex = new Map<string, number[]>();
  const topicIndex = new Map<string, number[]>();
  function index(map: Map<string, number[]>, key: string, position: number) {
    const bucket = map.get(key);
    if (bucket) bucket.push(position);
    else map.set(key, [position]);
  }
  pool.forEach((repo, i) => {
    index(ownerIndex, repo.owner, i);
    if (repo.language) index(languageIndex, repo.language, i);
    for (const topic of new Set(repo.topics)) index(topicIndex, topic, i);
  });
  // Keep the exact four-project diversity rule, updating its contribution only
  // when a project enters/leaves the window. Hot selection scans are numeric.
  const recent: Float64Array[] = [];
  while (result.length < pool.length) {
    let best = -1,
      score = -Infinity;
    const explore = result.length % 5 === 4;
    for (let i = 0; i < pool.length; i++) {
      if (chosen[i]) continue;
      const adjusted =
        base[i] -
        recentPenalty[i] -
        ownerPenalty[i] +
        (explore ? exploration[i] : 0);
      if (adjusted > score) {
        score = adjusted;
        best = i;
      }
    }
    const repo = pool[best];
    chosen[best] = 1;
    result.push(repo);
    for (const i of ownerIndex.get(repo.owner)!) ownerPenalty[i] += 2.5;
    const contribution = new Float64Array(pool.length);
    const overlap = new Uint16Array(pool.length);
    if (repo.language)
      for (const i of languageIndex.get(repo.language)!) contribution[i] = 0.65;
    for (const topic of repo.topics)
      for (const i of topicIndex.get(topic) ?? []) overlap[i]++;
    for (let i = 0; i < pool.length; i++) {
      contribution[i] += Math.min(0.8, overlap[i] * 0.25);
    }
    recent.push(contribution);
    if (recent.length > 4) recent.shift();
    // Summing at most four cached numbers avoids drift from repeated +/- updates.
    for (let i = 0; i < pool.length; i++) {
      recentPenalty[i] = 0;
      for (const previous of recent) recentPenalty[i] += previous[i];
    }
  }
  return result;
}
