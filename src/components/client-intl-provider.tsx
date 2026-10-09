"use client";
import { useEffect, useSyncExternalStore } from "react";
import { NextIntlClientProvider } from "next-intl";
import { browserLocale } from "@/lib/locale";
import en from "@/messages/en.json";
import zh from "@/messages/zh-CN.json";
import ja from "@/messages/ja.json";
import ko from "@/messages/ko.json";
import ru from "@/messages/ru.json";

const messages = { en, "zh-CN": zh, ja, ko, ru };
function subscribe(onChange: () => void) {
  window.addEventListener("discover-locale", onChange);
  return () => window.removeEventListener("discover-locale", onChange);
}
const serverLocale = () => "en" as const;

export function ClientIntlProvider({
  children,
  overrides,
}: {
  children: React.ReactNode;
  overrides?: Partial<Record<keyof typeof en, string>>;
}) {
  const locale = useSyncExternalStore(subscribe, browserLocale, serverLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={{ ...messages[locale], ...overrides }}
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>
  );
}
