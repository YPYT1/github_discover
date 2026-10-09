import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { Providers } from "../../src/components/providers";
import { Discover } from "../../src/components/feed/discover";
import { installDemo } from "./transport";
import en from "../../src/messages/en.json";
import zh from "../../src/messages/zh-CN.json";
import ja from "../../src/messages/ja.json";
import ko from "../../src/messages/ko.json";
import ru from "../../src/messages/ru.json";
import "../../src/app/globals.css";
installDemo();
const messages = { en, "zh-CN": zh, ja, ko, ru };
const choice =
  document.cookie.match(/(?:^|; )discover_locale=([^;]+)/)?.[1] ?? "en";
const locale = choice in messages ? (choice as keyof typeof messages) : "en";
const demoMessages = {
  ...messages[locale],
  source: "Demo · Sample data",
  oauthUnavailable:
    "Demo only · OAuth is available in the configured full application.",
  tokenPrivacy:
    "Demo only. Do not enter a real token here. Authentication is disabled and no credentials are transmitted.",
};
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <NextIntlClientProvider locale={locale} messages={demoMessages}>
      <Providers>
        <div className="bg-topic px-4 py-3 text-center text-sm text-primary">
          Interactive demo · 演示数据 / Sample data · No real login or GitHub
          writes
        </div>
        <Discover initialQuery={location.search.slice(1)} />
      </Providers>
    </NextIntlClientProvider>
  </React.StrictMode>,
);
