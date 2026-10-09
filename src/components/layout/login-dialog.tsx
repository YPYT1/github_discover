"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, ShieldCheck, ArrowUpRight } from "lucide-react";
import { Github } from "@/components/ui/github-icon";
import { useAccount } from "@/components/providers";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { post, errorCode, TOKEN_STORAGE_KEY } from "@/lib/client";
export function LoginDialog() {
  const t = useTranslations();
  const { loginOpen, setLoginOpen, authConfigured, reload } = useAccount();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/auth/token", { token: token.trim() });
      localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
      setToken("");
      await reload();
      setLoginOpen(false);
      window.dispatchEvent(new Event("discover-account"));
    } catch (error) {
      setError(errorCode(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={loginOpen}
      onOpenChange={(open) => {
        setLoginOpen(open);
        if (!open) {
          setToken("");
          setError("");
        }
      }}
    >
      <DialogContent>
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background">
          <Github size={25} aria-hidden />
        </div>
        <DialogTitle className="text-xl font-semibold">
          {t("loginTitle")}
        </DialogTitle>
        <DialogDescription className="mb-5 mt-2 text-sm leading-6 text-muted">
          {t("loginDescription")}
        </DialogDescription>
        {authConfigured ? (
          <Button asChild className="w-full" variant="primary">
            <a href="/api/auth/login">
              <Github size={18} aria-hidden />
              {t("oauth")}
              <ArrowUpRight size={16} aria-hidden />
            </a>
          </Button>
        ) : (
          <>
            <Button
              className="w-full"
              variant="primary"
              disabled
              aria-describedby="oauth-setup"
            >
              <Github size={18} aria-hidden />
              {t("oauth")}
            </Button>
            <p id="oauth-setup" className="mt-3 text-xs leading-5 text-muted">
              {t("oauthUnavailable")}
            </p>
          </>
        )}
        <p className="mt-3 text-xs leading-5 text-muted">{t("oauthNote")}</p>
        <div className="my-5 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" />
          {t("or")}
          <span className="h-px flex-1 bg-border" />
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="pat">
            {t("token")}
          </label>
          <input
            id="pat"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="control"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={t("tokenPlaceholder")}
            required
            aria-describedby="pat-privacy pat-permissions"
          />
          <div
            id="pat-privacy"
            className="flex gap-2 rounded-md bg-background p-3 text-xs leading-5 text-muted"
          >
            <ShieldCheck size={17} className="mt-0.5 shrink-0" aria-hidden />
            <p>{t("tokenPrivacy")}</p>
          </div>
          <details className="rounded-2xl border border-border p-3 text-xs leading-5 text-muted">
            <summary className="cursor-pointer font-medium">
              {t("tokenHelp")}
            </summary>
            <p id="pat-permissions" className="mt-2">
              {t("tokenPermissions")}
            </p>
          </details>
          <a
            href="https://github.com/settings/tokens"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {t("tokenDocs")}
            <ArrowUpRight size={14} aria-hidden />
          </a>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {t.has(`errors.${error}`)
                ? t(`errors.${error}`)
                : t("errors.serverError")}
            </p>
          )}
          <Button className="w-full" type="submit" disabled={busy}>
            {<KeyRound size={16} aria-hidden />}
            {t(busy ? "signingIn" : "tokenLogin")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
