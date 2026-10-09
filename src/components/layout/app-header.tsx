"use client";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  Sun,
  Moon,
  Languages,
  Bookmark,
  History,
  Star,
  LogOut,
  ExternalLink,
  Check,
  Search,
} from "lucide-react";
import { Github } from "@/components/ui/github-icon";
import Image from "next/image";
import Link from "next/link";
import { persistLocale } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/components/providers";
import { api, post, TOKEN_STORAGE_KEY } from "@/lib/client";
import { locales, type FeedTab, type Locale, type Theme } from "@/types";
import { LoginDialog } from "./login-dialog";
const localeNames: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  ko: "한국어",
  ja: "日本語",
  ru: "Русский",
};
const menuClass =
  "z-50 min-w-48 rounded-lg border border-border bg-surface p-1.5 shadow-lg";
const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-hover";
export function AppHeader({
  onCollection,
}: {
  onCollection: (tab: FeedTab) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const { user, loading, setLoginOpen, reload, report } = useAccount();
  async function preference(value: { locale?: Locale; theme?: Theme }) {
    if (value.theme) setTheme(value.theme);
    try {
      if (user)
        await api("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        });
      if (value.theme) setTheme(value.theme);
      if (value.locale) {
        persistLocale(value.locale);
        router.refresh();
      }
    } catch (error) {
      report(error);
    }
  }
  async function logout() {
    try {
      await post("/api/auth/logout", {});
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      await reload();
      onCollection("for-you");
      window.dispatchEvent(new Event("discover-account"));
    } catch (error) {
      report(error);
    }
  }
  return (
    <>
      <a
        href="#repositories"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-surface focus:p-3"
      >
        {t("skip")}
      </a>
      <header className="sticky top-0 z-30 h-16 border-b border-border bg-header">
        <div className="page-container flex h-full items-center justify-between gap-3">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3"
            aria-label="GitHub Discover"
          >
            <Github size={29} className="shrink-0" aria-hidden />
            <span className="text-xl font-semibold tracking-tight">
              {t("brand")}
            </span>
            <span className="hidden text-lg font-light text-muted sm:inline">
              / GitHub
            </span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              aria-label={t("search")}
              onClick={() =>
                document.getElementById("repository-search")?.focus()
              }
            >
              <Search size={18} aria-hidden />
            </Button>
            <Dropdown.Root>
              <Dropdown.Trigger asChild>
                <Button size="icon" variant="ghost" aria-label={t("locale")}>
                  <Languages size={18} aria-hidden />
                </Button>
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content
                  className={menuClass}
                  align="end"
                  sideOffset={8}
                >
                  {locales.map((value) => (
                    <Dropdown.Item
                      key={value}
                      className={itemClass}
                      onSelect={() => void preference({ locale: value })}
                    >
                      <span className="w-4">
                        {value === locale && <Check size={14} aria-hidden />}
                      </span>
                      {localeNames[value]}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
            <Button
              size="icon"
              aria-label={t("theme")}
              onClick={() =>
                void preference({
                  theme: resolvedTheme === "dark" ? "light" : "dark",
                })
              }
            >
              <Sun className="dark:hidden" size={18} aria-hidden />
              <Moon className="hidden dark:block" size={18} aria-hidden />
            </Button>
            {user ? (
              <Dropdown.Root>
                <Dropdown.Trigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t("account")}>
                    <Image
                      src={user.avatar}
                      alt={user.login}
                      width={30}
                      height={30}
                      className="rounded-full"
                    />
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Portal>
                  <Dropdown.Content
                    className={menuClass}
                    align="end"
                    sideOffset={8}
                  >
                    <Dropdown.Label className="px-3 py-2 text-sm font-semibold">
                      {user.login}
                    </Dropdown.Label>
                    <Dropdown.Separator className="my-1 h-px bg-border" />
                    <Dropdown.Item asChild className={itemClass}>
                      <a
                        href={`https://github.com/${user.login}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={16} aria-hidden />
                        {t("profile")}
                      </a>
                    </Dropdown.Item>
                    {(["stars", "saved", "history"] as const).map((tab) => {
                      const Icon =
                        tab === "stars"
                          ? Star
                          : tab === "saved"
                            ? Bookmark
                            : History;
                      return (
                        <Dropdown.Item
                          key={tab}
                          className={itemClass}
                          onSelect={() => onCollection(tab)}
                        >
                          <Icon size={16} aria-hidden />
                          {t(tab)}
                        </Dropdown.Item>
                      );
                    })}
                    <Dropdown.Separator className="my-1 h-px bg-border" />
                    <Dropdown.Item
                      className={`${itemClass} text-danger`}
                      onSelect={() => void logout()}
                    >
                      <LogOut size={16} aria-hidden />
                      {t("signOut")}
                    </Dropdown.Item>
                  </Dropdown.Content>
                </Dropdown.Portal>
              </Dropdown.Root>
            ) : (
              <Button onClick={() => setLoginOpen(true)} disabled={loading}>
                <Github size={17} aria-hidden />
                <span className="hidden sm:inline">{t("signIn")}</span>
              </Button>
            )}
          </div>
        </div>
      </header>
      <LoginDialog />
    </>
  );
}
