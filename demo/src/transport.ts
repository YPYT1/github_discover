import type { Repository } from "../../src/types";
import { parseFilters } from "../../src/lib/filters";
// Deliberately synthetic, isolated in this standalone build. Never imported by production.
const repos: Repository[] = Array.from({ length: 48 }, (_, i) => ({
  id: i + 1,
  owner: `demo-labs-${i % 8}`,
  name:
    [
      "signal-kit",
      "little-agent",
      "garden-ui",
      "query-studio",
      "orbit-cli",
      "paper-trail",
    ][i % 6] + `-${i + 1}`,
  fullName: `demo-labs-${i % 8}/project-${i + 1}`,
  avatar: "https://avatars.githubusercontent.com/u/9919",
  description: [
    "A thoughtful toolkit for building your next idea. Small, composable, and made for curious developers.",
    "Explore a quieter way to work with data, with clear interfaces and sensible defaults.",
    "An experimental open-source workspace for learning, building and sharing.",
  ][i % 3],
  stars: [42, 320, 1800, 6400, 24000, 128000][i % 6],
  forks: [8, 120, 460, 1700, 5400, 18000][i % 6],
  language: ["TypeScript", "Python", "Rust", "Go"][i % 4],
  topics: [i % 2 ? "machine-learning" : "developer-tools"],
  license: "MIT",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  url: "https://github.com/explore",
}));
export function installDemo() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      location.origin,
    );
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
      return original(input, init);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (url.pathname === "/api/me")
      return Response.json({ user: null, authConfigured: false });
    if (url.pathname.startsWith("/api/auth/"))
      return Response.json({ error: "demoOnly" }, { status: 400 });
    if (url.pathname === "/api/feed") {
      const params = new URLSearchParams(body.query ?? url.search);
      const f = parseFilters(params);
      const page = Number(body.cursor ?? params.get("cursor") ?? 0);
      let items = repos.filter(
        (r) =>
          (!f.q ||
            `${r.fullName} ${r.description} ${r.topics.join(" ")}`
              .toLowerCase()
              .includes(f.q.replace("topic:", "").toLowerCase())) &&
          (!f.language || f.language.split(",").includes(r.language!)) &&
          (f.category === "all" ||
            f.category
              .split(",")
              .some((c) =>
                r.topics.includes(
                  c === "ai"
                    ? "machine-learning"
                    : c === "tools"
                      ? "developer-tools"
                      : c,
                ),
              )) &&
          r.stars >= f.minStars &&
          (!f.license || r.license?.toLowerCase() === f.license) &&
          (!f.created || r.createdAt >= f.created) &&
          (!f.updated || r.updatedAt >= f.updated),
      );
      if (["saved", "history", "stars", "following"].includes(f.tab))
        return Response.json({ error: "loginRequired" }, { status: 401 });
      if (f.sort === "stars") items = items.sort((a, b) => b.stars - a.stars);
      const slice = items
        .slice(page, page + 12)
        .filter((r) => !body.seen?.includes(r.id));
      return Response.json({
        repositories: slice,
        total: items.length,
        nextCursor: page + 12 < items.length ? String(page + 12) : null,
      });
    }
    if (url.pathname.startsWith("/api/repositories/")) {
      const name = decodeURIComponent(
        url.pathname.slice("/api/repositories/".length),
      );
      const repo = repos.find((r) => r.fullName === name);
      return repo
        ? Response.json({
            ...repo,
            languages: { [repo.language!]: 80, Shell: 20 },
          })
        : Response.json({ error: "notFound" }, { status: 404 });
    }
    return Response.json({ error: "demoOnly" }, { status: 400 });
  };
}
