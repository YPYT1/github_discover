"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { User } from "@/types";
import { api, errorCode, TOKEN_STORAGE_KEY } from "@/lib/client";
import { persistLocale } from "@/lib/preferences";
interface AccountContext {
  user: User | null;
  authConfigured: boolean;
  loading: boolean;
  loginOpen: boolean;
  setLoginOpen: (open: boolean) => void;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  report: (error: unknown) => void;
}
const Context = createContext<AccountContext | null>(null);
export function useAccount() {
  const context = useContext(Context);
  if (!context) throw new Error("Missing account provider");
  return context;
}
function AccountProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [message, setMessage] = useState("");
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { setTheme } = useTheme();
  const report = useCallback(
    (error: unknown) => {
      const code = errorCode(error);
      setMessage(
        t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.serverError"),
      );
    },
    [t],
  );
  const applyAccount = useCallback(
    (data: { user: User | null; authConfigured: boolean }) => {
      setUser(data.user);
      setAuthConfigured(data.authConfigured);
      if (data.user) {
        if (data.user.authMethod === "oauth")
          localStorage.removeItem(TOKEN_STORAGE_KEY);
        setTheme(data.user.theme);
        if (data.user.locale !== locale) {
          persistLocale(data.user.locale);
          router.refresh();
        }
      }
    },
    [locale, router, setTheme],
  );
  const reload = useCallback(async () => {
    try {
      applyAccount(
        await api<{ user: User | null; authConfigured: boolean }>("/api/me"),
      );
    } catch (error) {
      report(error);
    } finally {
      setLoading(false);
    }
  }, [applyAccount, report]);
  useEffect(() => {
    let active = true;
    api<{ user: User | null; authConfigured: boolean }>("/api/me")
      .then((data) => {
        if (active) applyAccount(data);
      })
      .catch((error) => {
        if (active) report(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyAccount, report]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <Context.Provider
      value={{
        user,
        authConfigured,
        loading,
        loginOpen,
        setLoginOpen,
        reload,
        notify: setMessage,
        report,
      }}
    >
      {children}
      <div
        className="fixed bottom-5 left-1/2 z-[60] w-max max-w-[calc(100%-24px)] -translate-x-1/2"
        role="status"
        aria-live="polite"
      >
        {message && (
          <div className="rounded-lg border border-border bg-surface px-5 py-3 text-sm shadow-lg">
            {message}
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AccountProvider>{children}</AccountProvider>
    </ThemeProvider>
  );
}
