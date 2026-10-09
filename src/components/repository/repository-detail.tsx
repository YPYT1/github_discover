"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import {
  Star,
  Bookmark,
  Share2,
  EyeOff,
  GitFork,
  ArrowUpRight,
  LoaderCircle,
} from "lucide-react";
import { Github } from "@/components/ui/github-icon";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/components/providers";
import { api, post, errorCode } from "@/lib/client";
import type { Repository } from "@/types";
import { LanguageBar, languageColors } from "./language-bar";
import { markSeen } from "@/lib/seen-client";
export function RepositoryDetail({
  name,
  initial,
  onClose,
  onDismiss,
}: {
  name: string | null;
  initial: Repository | undefined;
  onClose: () => void;
  onDismiss: (id: number) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { user, setLoginOpen, notify, report } = useAccount();
  const [repo, setRepo] = useState<Repository | undefined>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [starred, setStarred] = useState<boolean | null>(null);
  const [savedKnown, setSavedKnown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!name) return;
    const controller = new AbortController();
    let active = true;
    async function load() {
      setRepo(initial);
      setLoading(true);
      setError("");
      setSaved(false);
      setStarred(null);
      setSavedKnown(false);
      try {
        const data = await api<Repository>(`/api/repositories/${name}`, {
          signal: controller.signal,
        });
        if (active) {
          setRepo(data);
          try {
            markSeen(data.id, user?.id);
          } catch (error) {
            report(error);
          }
        }
      } catch (error) {
        if (
          active &&
          !(error instanceof DOMException && error.name === "AbortError")
        )
          setError(errorCode(error));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    if (user) {
      void api<{ saved: boolean; starred: boolean | null; starError?: string }>(
        `/api/me/repository?${new URLSearchParams({ name })}`,
        { signal: controller.signal },
      )
        .then((state) => {
          if (active) {
            setSaved(state.saved);
            setStarred(state.starred);
            setSavedKnown(true);
            if (state.starError) setError(state.starError);
          }
        })
        .catch((error) => {
          if (active) report(error);
        });
      void post("/api/me/repository", { name, action: "history" }).catch(
        report,
      );
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, [name, initial, user, report, attempt]);
  async function action(type: "save" | "star" | "dismiss") {
    if (!user) {
      setLoginOpen(true);
      return;
    }
    if (!repo) return;
    setBusy(true);
    try {
      await post("/api/me/repository", {
        name: repo.fullName,
        action: type,
        enabled: type === "save" ? !saved : !starred,
      });
      if (type === "save") setSaved(!saved);
      if (type === "star") setStarred(!starred);
      if (type === "dismiss") {
        onDismiss(repo.id);
        onClose();
        notify(t("dismissed"));
      } else notify(t("actionDone"));
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("repo", name!);
      await navigator.clipboard.writeText(url.toString());
      notify(t("copied"));
    } catch {
      notify(t("errors.clipboardError"));
    }
  }
  return (
    <Dialog
      open={Boolean(name)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent drawer>
        <DialogTitle className="pr-8 text-sm font-medium text-muted">
          {t("details")}
        </DialogTitle>
        <DialogDescription className="sr-only">{name}</DialogDescription>
        {repo ? (
          <div className="mt-7 space-y-6">
            <div className="flex items-start gap-4">
              <Image
                src={repo.avatar}
                alt=""
                width={64}
                height={64}
                className="rounded-xl border border-border"
              />
              <h2 className="min-w-0 break-words text-2xl font-semibold leading-8">
                <span className="block text-base font-normal text-muted">
                  {repo.owner}/
                </span>
                {repo.name}
              </h2>
            </div>
            <p className="text-base leading-7">
              {repo.description ?? t("noDescription")}
            </p>
            <div className="flex flex-wrap gap-5 text-sm">
              <span className="flex items-center gap-2">
                <Star size={17} aria-hidden />
                {new Intl.NumberFormat(locale).format(repo.stars)}{" "}
                {t("starCount")}
              </span>
              <span className="flex items-center gap-2">
                <GitFork size={17} aria-hidden />
                {new Intl.NumberFormat(locale).format(repo.forks)}{" "}
                {t("forkCount")}
              </span>
              {repo.license && (
                <span className="text-muted">{repo.license}</span>
              )}
            </div>
            <Button asChild className="w-full">
              <a href={repo.url} target="_blank" rel="noreferrer">
                <Github size={17} aria-hidden />
                {t("openGitHub")}
                <ArrowUpRight size={16} aria-hidden />
              </a>
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void action("save")}
                disabled={busy || Boolean(user && !savedKnown)}
              >
                <Bookmark
                  size={16}
                  fill={saved ? "currentColor" : "none"}
                  aria-hidden
                />
                {t(saved ? "unsave" : "save")}
              </Button>
              <Button
                onClick={() => void action("star")}
                disabled={busy || Boolean(user && starred === null)}
              >
                <Star
                  size={16}
                  fill={starred ? "currentColor" : "none"}
                  aria-hidden
                />
                {t(starred ? "unstar" : "star")}
              </Button>
              <Button onClick={() => void share()}>
                <Share2 size={16} aria-hidden />
                {t("share")}
              </Button>
            </div>
            {user && !user.canStar && (
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="mb-3 text-xs leading-5 text-muted">
                  {t("starScopeNote")}
                </p>
                <Button asChild size="sm">
                  <a href="/api/auth/login?write=1">{t("grantStar")}</a>
                </Button>
              </div>
            )}
            {repo.topics.length > 0 && (
              <section>
                <h3 className="mb-3 text-sm font-semibold">{t("topics")}</h3>
                <div className="flex flex-wrap gap-2">
                  {repo.topics.map((topic) => (
                    <span
                      className="rounded-full bg-topic px-3 py-1 text-xs text-primary"
                      key={topic}
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {repo.languages && (
              <section>
                <h3 className="mb-3 text-sm font-semibold">{t("languages")}</h3>
                <div className="overflow-hidden rounded-full">
                  <LanguageBar languages={repo.languages} />
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                  {Object.entries(repo.languages).map(([language, bytes]) => (
                    <span
                      key={language}
                      className="inline-flex items-center gap-1.5"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background: languageColors[language] ?? "#8b949e",
                        }}
                      />
                      {language}{" "}
                      {(
                        (bytes /
                          Object.values(repo.languages!).reduce(
                            (a, b) => a + b,
                            0,
                          )) *
                        100
                      ).toFixed(1)}
                      %
                    </span>
                  ))}
                </div>
              </section>
            )}
            <div className="space-y-2 border-t border-border pt-4 text-xs text-muted">
              <p>
                {t("createdOn", {
                  date: new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                  }).format(new Date(repo.createdAt)),
                })}
              </p>
              <p>
                {t("updatedOn", {
                  date: new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                  }).format(new Date(repo.updatedAt)),
                })}
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => void action("dismiss")}
              disabled={busy}
              className="text-muted"
            >
              <EyeOff size={16} aria-hidden />
              {t("notInterested")}
            </Button>
          </div>
        ) : null}
        {loading && (
          <p className="mt-5 flex items-center gap-2 text-sm text-muted">
            <LoaderCircle size={16} className="animate-spin" aria-hidden />
            {t("detailsLoading")}
          </p>
        )}
        {error && (
          <div role="alert" className="mt-5 space-y-3 text-sm">
            <p className="text-danger">
              {t.has(`errors.${error}`)
                ? t(`errors.${error}`)
                : t("errors.serverError")}
            </p>
            <Button onClick={() => setAttempt((value) => value + 1)}>
              {t("retry")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
