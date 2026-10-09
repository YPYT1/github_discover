export const locales = ["en", "zh-CN", "ko", "ja", "ru"] as const;
export type Locale = (typeof locales)[number];
export type Theme = "light" | "dark" | "system";
export type FeedTab =
  | "for-you"
  | "trending"
  | "latest"
  | "following"
  | "saved"
  | "history"
  | "stars";
export interface Repository {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  avatar: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  license: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
  languages?: Record<string, number>;
  contributors?: number;
  growth?: number;
}
export interface User {
  id: number;
  login: string;
  name: string | null;
  avatar: string;
  locale: Locale;
  theme: Theme;
  canStar: boolean;
  authMethod: "oauth" | "pat";
}
export interface FeedResponse {
  repositories: Repository[];
  nextCursor: string | null;
  total: number;
  notice?:
    | "trendPending"
    | "searchLimit"
    | "followingLimit"
    | "latestScope"
    | "multiScope";
}
export const categories = [
  "all",
  "ai",
  "tools",
  "web",
  "backend",
  "database",
  "cli",
  "automation",
  "mobile",
  "devops",
  "education",
  "security",
  "games",
] as const;
export const languages = [
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
  "Other",
];
