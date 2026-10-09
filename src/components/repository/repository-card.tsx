"use client";
import Image from "next/image";
import { Star, GitFork, Clock, ArrowUpRight, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Repository } from "@/types";
import { LanguageBar, languageColors } from "./language-bar";
import { Metric } from "./metric";
export function RepositoryCard({
  repo,
  onOpen,
  onTopic,
}: {
  repo: Repository;
  onOpen: () => void;
  onTopic: (topic: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const number = (value: number) =>
    new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  const date = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(repo.updatedAt));
  return (
    <article className="repo-card relative overflow-hidden rounded-xl border border-border bg-surface">
      <div className="repo-preview flex flex-col p-5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-xl leading-7">
            <span className="block truncate text-base font-normal text-muted">
              {repo.owner}/
            </span>
            <button
              onClick={onOpen}
              className="after:absolute after:inset-0 after:z-0 line-clamp-2 break-words text-left font-semibold"
              aria-label={t("openDetails", { name: repo.fullName })}
            >
              {repo.name}
            </button>
          </h2>
          <Image
            src={repo.avatar}
            alt=""
            width={48}
            height={48}
            className="shrink-0 rounded-lg border border-border bg-background"
            loading="lazy"
          />
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-muted">
          {repo.description ?? t("noDescription")}
        </p>
        <div className="mt-auto flex items-end gap-8 pt-6">
          <Metric value={repo.stars} label={t("starCount")} />
          <Metric value={repo.forks} label={t("forkCount")} />
          {repo.growth !== undefined && (
            <div>
              <span className="flex items-center gap-1 text-lg font-semibold text-primary">
                <TrendingUp size={16} aria-hidden />
                {number(repo.growth)}
              </span>
              <span className="text-xs text-muted">{t("growth")}</span>
            </div>
          )}
          <ArrowUpRight
            size={17}
            aria-hidden
            className="ml-auto self-end text-muted"
          />
        </div>
      </div>
      <LanguageBar languages={repo.languages} />
      <div className="border-t border-border p-5">
        <div className="mb-3 flex items-center gap-2">
          <Image
            src={repo.avatar}
            alt=""
            width={28}
            height={28}
            className="rounded-full"
            loading="lazy"
          />
          <span className="min-w-0 truncate text-sm font-semibold">
            {repo.fullName}
          </span>
        </div>
        <p className="line-clamp-4 text-sm leading-6">
          {repo.description ?? t("noDescription")}
        </p>
        {repo.topics.length > 0 && (
          <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
            {repo.topics.slice(0, 3).map((topic) => (
              <button
                key={topic}
                onClick={() => onTopic(topic)}
                className="max-w-full rounded-full bg-topic px-2.5 py-1 text-xs leading-5 text-primary hover:underline break-words"
              >
                {topic}
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Star size={13} aria-hidden />
            {number(repo.stars)}
          </span>
          <span className="inline-flex items-center gap-1">
            <GitFork size={13} aria-hidden />
            {number(repo.forks)}
          </span>
          {repo.language && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: languageColors[repo.language] ?? "#8b949e",
                }}
              />
              {repo.language}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1"
            title={t("updatedOn", { date })}
          >
            <Clock size={13} aria-hidden />
            {date}
          </span>
          {repo.license && <span>{repo.license}</span>}
        </div>
      </div>
    </article>
  );
}
