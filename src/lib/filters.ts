import type { FeedTab } from "@/types";
import { AppError } from "./app-error";
export const categoryTopics: Record<string, string> = {
  ai: "machine-learning",
  tools: "developer-tools",
  web: "web",
  backend: "backend",
  database: "database",
  cli: "cli",
  automation: "automation",
  mobile: "mobile",
  devops: "devops",
  education: "education",
  security: "security",
  games: "game",
};
const tabs: FeedTab[] = [
  "for-you",
  "trending",
  "latest",
  "following",
  "saved",
  "history",
  "stars",
];
export function parseFilters(params: URLSearchParams) {
  const tab = params.get("tab") ?? "for-you";
  if (!tabs.includes(tab as FeedTab)) throw new AppError("invalidRequest");
  const period = params.get("period") ?? "week";
  if (!["day", "week", "month"].includes(period))
    throw new AppError("invalidRequest");
  const sort = params.get("sort") ?? "recommended";
  if (!["recommended", "created", "updated", "stars", "growth"].includes(sort))
    throw new AppError("invalidRequest");
  const min = params.get("minStars") ?? "0";
  if (!/^\d{1,9}$/.test(min)) throw new AppError("invalidRequest");
  const date = (key: string) => {
    const value = params.get(key) ?? "";
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))
    )
      throw new AppError("invalidRequest");
    return value;
  };
  const q = (params.get("q") ?? "").trim();
  if (q.length > 256) throw new AppError("invalidSearch");
  const category = params.get("category") ?? "all";
  if (
    category !== "all" &&
    (category.split(",").length > 12 ||
      category.split(",").some((c) => !categoryTopics[c]))
  )
    throw new AppError("invalidRequest");
  const language = params.get("language") ?? "";
  if (
    language.length > 400 ||
    language.split(",").some((l) => l.length > 32 || /["\r\n]/.test(l))
  )
    throw new AppError("invalidRequest");
  const license = params.get("license") ?? "";
  if (
    license &&
    !["mit", "apache-2.0", "gpl-3.0", "bsd-3-clause", "unlicense"].includes(
      license,
    )
  )
    throw new AppError("invalidRequest");
  return {
    tab: tab as FeedTab,
    period,
    sort,
    minStars: Number(min),
    q,
    category,
    language,
    license,
    created: date("created"),
    updated: date("updated"),
  };
}
export type Filters = ReturnType<typeof parseFilters>;
export function filterVariants(f: Filters): Filters[] {
  return [...new Set(f.language.split(","))].flatMap((language) =>
    [...new Set(f.category.split(","))].map((category) => ({
      ...f,
      language,
      category,
    })),
  );
}
export function searchQuery(filters: Filters, now = new Date()) {
  const parts = [
    filters.q || "stars:>=10",
    "is:public",
    "archived:false",
    "fork:false",
  ];
  if (filters.minStars) parts.push(`stars:>=${filters.minStars}`);
  if (filters.language === "Other") {
    for (const language of [
      "TypeScript",
      "JavaScript",
      "Python",
      "Rust",
      "Go",
      "Java",
      "C++",
      "C#",
      "Swift",
      "Kotlin",
    ])
      parts.push(`-language:"${language}"`);
  } else if (filters.language)
    parts.push(`language:"${filters.language.replaceAll('"', "")}"`);
  if (filters.category !== "all")
    parts.push(`topic:${categoryTopics[filters.category]}`);
  if (filters.license) parts.push(`license:${filters.license}`);
  if (filters.created) parts.push(`created:>=${filters.created}`);
  if (filters.updated) parts.push(`pushed:>=${filters.updated}`);
  if (filters.tab === "latest" && !filters.created)
    parts.push(
      `created:>=${new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10)}`,
    );
  return parts.join(" ");
}
