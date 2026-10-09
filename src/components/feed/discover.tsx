"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Search,
  RefreshCw,
  Flame,
  Sparkles,
  Clock,
  Users,
  ArrowUpRight,
  LoaderCircle,
  SearchX,
  AlertCircle,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/components/providers";
import { api, errorCode } from "@/lib/client";
import type { FeedTab, FeedResponse, Repository } from "@/types";
import { FilterBar, defaultFilters, type FilterValues } from "./filter-bar";
import { MasonryFeed } from "./masonry-feed";
import { FeedSkeleton } from "./feed-skeleton";
import { RepositoryCard } from "@/components/repository/repository-card";
import { RepositoryDetail } from "@/components/repository/repository-detail";
import { markSeen, seenIds, flushSeen } from "@/lib/seen-client";
import { Exposure } from "./exposure";
const tabs = [
  { value: "for-you", icon: Sparkles },
  { value: "trending", icon: Flame },
  { value: "latest", icon: Clock },
  { value: "following", icon: Users },
] as const;
function stateFromParams(params: URLSearchParams) {
  const filters = { ...defaultFilters };
  for (const key of Object.keys(filters) as (keyof FilterValues)[])
    if (params.has(key)) filters[key] = params.get(key)!;
  return {
    filters,
    tab: (params.get("tab") ?? "for-you") as FeedTab,
    q: params.get("q") ?? "",
  };
}
export function Discover({ initialQuery }: { initialQuery: string }) {
  const initial = stateFromParams(new URLSearchParams(initialQuery));
  const [filters, setFilters] = useState(initial.filters);
  const [tab, setTab] = useState<FeedTab>(initial.tab);
  const [q, setQ] = useState(initial.q);
  const [input, setInput] = useState(initial.q);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<FeedResponse["notice"]>();
  const [selected, setSelected] = useState<string | null>(
    new URLSearchParams(initialQuery).get("repo"),
  );
  const [refresh, setRefresh] = useState(0);
  const t = useTranslations();
  const {
    user,
    loading: accountLoading,
    setLoginOpen,
    notify,
    report,
    loginOpen,
  } = useAccount();
  const userId = user?.id;
  const recommendation =
    tab === "for-you" && !q && filters.sort === "recommended";
  const recordSeen = useCallback(
    (id: number) => {
      try {
        markSeen(id, userId);
        void flushSeen(userId).catch(report);
      } catch (error) {
        report(error);
      }
    },
    [userId, report],
  );
  useEffect(() => {
    if (!user) return;
    const sync = () => {
      void flushSeen(user.id).catch(report);
    };
    sync();
    const timer = setInterval(sync, 5000);
    return () => clearInterval(timer);
  }, [user, report]);
  const requestRef = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const search = useRef<HTMLInputElement>(null);
  const openedByUs = useRef(false);
  const lastKey = useRef("");
  const query = new URLSearchParams({
    tab,
    ...filters,
    ...(q ? { q } : {}),
  }).toString();
  const load = useCallback(
    async (append: boolean, next: string | null) => {
      if (append && busy.current) return;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      busy.current = true;
      setLoading(true);
      setError("");
      try {
        let excluded: number[] = [];
        if (recommendation) {
          try {
            excluded = seenIds(userId);
            await flushSeen(userId);
          } catch (error) {
            report(error);
          }
        }
        const data = await api<FeedResponse>(
          `/api/feed?${query}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`,
          recommendation
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  query,
                  cursor: next,
                  seen: excluded.slice(-10000),
                }),
                signal: controller.signal,
              }
            : { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const blocked = new Set(recommendation ? seenIds(userId) : []);
        setRepos((previous) => {
          const existing = append ? previous : [];
          const ids = new Set(existing.map((repo) => repo.id));
          return [
            ...existing,
            ...data.repositories.filter(
              (repo) => !ids.has(repo.id) && !blocked.has(repo.id),
            ),
          ];
        });
        setCursor(data.nextCursor);
        setTotal(data.total);
        setNotice(data.notice);
      } catch (error) {
        if (!controller.signal.aborted) setError(errorCode(error));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          busy.current = false;
        }
      }
    },
    [query, recommendation, userId, report],
  );
  useEffect(() => {
    if (accountLoading) return;
    const key = query + user?.id + refresh;
    if (lastKey.current === key) return;
    lastKey.current = key;
    setRepos([]);
    setCursor(null);
    setNotice(undefined);
    void load(false, null);
    return () => {
      requestRef.current?.abort();
      lastKey.current = "";
    };
  }, [query, user?.id, refresh, accountLoading, load]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(query);
    if (selected) params.set("repo", selected);
    if (url.searchParams.get("authError"))
      params.set("authError", url.searchParams.get("authError")!);
    window.history.replaceState(null, "", `${url.pathname}?${params}`);
  }, [query, selected]);
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setSelected(params.get("repo"));
      const state = stateFromParams(params);
      setFilters(state.filters);
      setTab(state.tab);
      setQ(state.q);
      setInput(state.q);
      openedByUs.current = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !(
          event.target instanceof HTMLElement &&
          (event.target.matches("input,textarea,select") ||
            event.target.isContentEditable)
        )
      ) {
        event.preventDefault();
        search.current?.focus();
      }
    };
    const account = () => setRefresh((value) => value + 1);
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    window.addEventListener("discover-account", account);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("discover-account", account);
    };
  }, []);
  useEffect(() => {
    const code = new URLSearchParams(initialQuery).get("authError");
    if (code)
      notify(
        t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.authFailed"),
      );
  }, [initialQuery, notify, t]);
  useEffect(() => {
    if (!sentinel.current || !cursor || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !busy.current) void load(true, cursor);
      },
      { rootMargin: "500px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [cursor, error, load, loading]);
  function selectTab(value: FeedTab) {
    setTab(value);
    setQ("");
    setInput("");
    setFilters(defaultFilters);
  }
  function selectTopic(topic: string) {
    if (collection) {
      setTab("for-you");
      setFilters(defaultFilters);
    }
    setInput(`topic:${topic}`);
    setQ(`topic:${topic}`);
  }
  function open(repo: Repository) {
    recordSeen(repo.id);
    openedByUs.current = true;
    const url = new URL(window.location.href);
    url.searchParams.set("repo", repo.fullName);
    window.history.pushState(null, "", url);
    setSelected(repo.fullName);
  }
  function close() {
    if (openedByUs.current) {
      window.history.back();
      openedByUs.current = false;
    } else {
      setSelected(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("repo");
      window.history.replaceState(null, "", url);
    }
  }
  const collection = ["saved", "history", "stars"].includes(tab);
  const label = t.has(tab) ? t(tab) : t("for-you");
  return (
    <>
      <AppHeader onCollection={selectTab} />
      <main className="page-container pb-12" id="repositories">
        <section className="flex items-start justify-between gap-4 pb-7 pt-9 sm:pt-10">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[32px] sm:leading-10">
              {collection ? label : t("title")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted sm:text-base">
              {collection ? t("collectionHint") : t("subtitle")}
            </p>
          </div>
          <Button
            onClick={() => setRefresh((value) => value + 1)}
            disabled={loading}
            className="mt-1"
          >
            <RefreshCw
              size={16}
              className={loading ? "animate-spin" : ""}
              aria-hidden
            />
            <span className="hidden sm:inline">{t("refresh")}</span>
          </Button>
        </section>
        <form
          className="relative mb-7"
          onSubmit={(event) => {
            event.preventDefault();
            setQ(input.trim());
          }}
        >
          <label htmlFor="repository-search" className="sr-only">
            {t("search")}
          </label>
          <Search
            size={20}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            ref={search}
            id="repository-search"
            className="h-13 w-full rounded-lg border border-border bg-surface py-3 pl-12 pr-16 text-base outline-none placeholder:text-muted focus:border-primary"
            placeholder={t("searchPlaceholder")}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={256}
          />
          <button
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded border border-border text-muted"
            type="submit"
            aria-label={t("search")}
          >
            <ArrowUpRight size={15} aria-hidden />
          </button>
        </form>
        <div className="sticky top-16 z-20 -mx-1 border-b border-border bg-background px-1 pb-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <nav aria-label={t("explore")} className="flex overflow-x-auto">
              {tabs.map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => selectTab(value)}
                  aria-current={tab === value ? "page" : undefined}
                  className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm ${tab === value ? "border-accent font-semibold" : "border-transparent text-muted hover:text-foreground"}`}
                >
                  <Icon size={16} aria-hidden />
                  {t(value)}
                </button>
              ))}
              {collection && (
                <span className="flex shrink-0 items-center border-b-2 border-accent px-3 text-sm font-semibold">
                  {label}
                </span>
              )}
            </nav>
            <div className="w-full xl:max-w-[650px]">
              <FilterBar
                values={filters}
                onChange={setFilters}
                trending={tab === "trending" || filters.sort === "growth"}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-5 text-xs text-muted">
          <span>
            {t("count", { count: total })} · {label}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t("source")}
          </span>
        </div>
        {notice && (
          <p
            role="status"
            className="mb-5 rounded-lg border border-border bg-surface p-4 text-sm leading-6 text-muted"
          >
            {t(notice)}
          </p>
        )}
        {loading && repos.length === 0 ? (
          <FeedSkeleton />
        ) : repos.length > 0 ? (
          <MasonryFeed>
            {repos.map((repo) => (
              <Exposure
                id={repo.id}
                active={recommendation && !selected && !loginOpen}
                onSeen={recordSeen}
                key={repo.id}
              >
                <RepositoryCard
                  repo={repo}
                  onOpen={() => open(repo)}
                  onTopic={selectTopic}
                />
              </Exposure>
            ))}
          </MasonryFeed>
        ) : !error ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
            <SearchX size={35} className="text-muted" aria-hidden />
            <h2 className="text-lg font-semibold">{t("empty")}</h2>
            <p className="text-sm text-muted">
              {notice === "trendPending"
                ? t("trendPending")
                : recommendation
                  ? t("recommendationEmpty")
                  : t("emptyHint")}
            </p>
            <Button
              onClick={() => {
                setFilters(defaultFilters);
                setQ("");
                setInput("");
              }}
            >
              {t("clear")}
            </Button>
          </div>
        ) : null}
        {error && (
          <div
            role="alert"
            className="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center"
          >
            <AlertCircle size={28} className="text-muted" aria-hidden />
            <h2 className="text-lg font-semibold">{t("errorTitle")}</h2>
            <p className="text-sm leading-6 text-muted">
              {t.has(`errors.${error}`)
                ? t(`errors.${error}`)
                : t("errors.serverError")}
            </p>
            {error === "loginRequired" || error === "localTokenRequired" ? (
              <Button onClick={() => setLoginOpen(true)}>{t("signIn")}</Button>
            ) : (
              <Button onClick={() => void load(repos.length > 0, cursor)}>
                {t("retry")}
              </Button>
            )}
          </div>
        )}
        <div
          ref={sentinel}
          className="flex min-h-24 items-center justify-center pt-8"
        >
          {repos.length > 0 &&
            (loading ? (
              <span
                className="flex items-center gap-2 text-sm text-muted"
                role="status"
              >
                <LoaderCircle size={16} className="animate-spin" aria-hidden />
                {t("loading")}
              </span>
            ) : cursor && !error ? (
              <Button onClick={() => void load(true, cursor)}>
                {t("loadMore")}
              </Button>
            ) : !error ? (
              <p className="text-xs text-muted">{t("end")}</p>
            ) : null)}
        </div>
        <footer className="mt-6 flex flex-col justify-between gap-2 border-t border-border pt-5 text-xs text-muted sm:flex-row">
          <span>{t("footer")}</span>
          <span>{t("footerNote")}</span>
        </footer>
      </main>
      <RepositoryDetail
        name={selected}
        initial={repos.find((repo) => repo.fullName === selected)}
        onClose={close}
        onDismiss={(id) =>
          setRepos((previous) => previous.filter((repo) => repo.id !== id))
        }
      />
    </>
  );
}
