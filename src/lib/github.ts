import { AppError } from "./http";
import type { Repository } from "@/types";
import { errorCategory, recordGitHub } from "./observability";
export interface GitHubRepository {
  private?: boolean;
  id: number;
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics?: string[];
  license: { spdx_id: string } | null;
  created_at: string;
  updated_at: string;
  html_url: string;
}
export function normalizeRepository(repo: GitHubRepository): Repository {
  return {
    id: repo.id,
    fullName: repo.full_name,
    owner: repo.owner.login,
    name: repo.name,
    avatar: repo.owner.avatar_url,
    description: repo.description,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    language: repo.language,
    topics: repo.topics ?? [],
    license:
      repo.license?.spdx_id === "NOASSERTION"
        ? null
        : (repo.license?.spdx_id ?? null),
    createdAt: repo.created_at,
    updatedAt: repo.updated_at,
    url: repo.html_url,
  };
}
export async function githubResponse(
  path: string,
  token?: string,
  init?: RequestInit,
) {
  const start = performance.now();
  const pathname = path.split("?")[0];
  const endpoint =
    pathname === "/search/repositories"
      ? "search"
      : pathname === "/user"
        ? "identity"
        : pathname.startsWith("/user/starred/")
          ? "star"
          : pathname === "/user/starred"
            ? "stars"
            : pathname === "/user/following"
              ? "following"
              : pathname.startsWith("/repos/") ||
                  /^\/users\/[^/]+\/repos$/.test(pathname)
                ? "repositories"
                : "other";
  let response: Response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "GitHub-Discover",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    recordGitHub(
      {
        endpoint,
        durationMs: performance.now() - start,
        errorCode:
          errorCategory(error) === "timeout" ? "timeout" : "networkError",
        outcome: "error",
      },
      true,
    );
    throw new AppError("networkError", 502);
  }
  recordGitHub(
    {
      endpoint,
      status: response.status,
      durationMs: performance.now() - start,
      remaining: Number(response.headers.get("x-ratelimit-remaining") ?? NaN),
      resetAt: Number(response.headers.get("x-ratelimit-reset") ?? NaN),
      retryAfter: Number(response.headers.get("retry-after") ?? NaN),
      outcome: response.ok ? "ok" : "error",
      ...(response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get("x-ratelimit-remaining") === "0" ||
          response.headers.has("retry-after")))
        ? { errorCode: "rateLimited" }
        : {}),
    },
    !response.ok,
  );
  if (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        response.headers.has("retry-after")))
  )
    throw new AppError("rateLimited", 429);
  if (response.status === 401) throw new AppError("reauthorize", 401);
  if (response.status === 404) throw new AppError("notFound", 404);
  if (response.status === 422) throw new AppError("invalidSearch", 400);
  if (!response.ok) throw new AppError("githubError", 502);
  return response;
}
export async function github<T>(path: string, token?: string): Promise<T> {
  return (await githubResponse(path, token)).json() as Promise<T>;
}
