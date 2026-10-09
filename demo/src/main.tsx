import React from "react";
import { createRoot } from "react-dom/client";
import { ClientIntlProvider } from "../../src/components/client-intl-provider";
import { Providers } from "../../src/components/providers";
import { Discover } from "../../src/components/feed/discover";
import { installDemo } from "./transport";
import "../../src/app/globals.css";
installDemo();
const demoMessages = {
  source: "Demo · Sample data",
  oauthUnavailable:
    "Demo only · OAuth is available in the configured full application.",
  tokenPrivacy:
    "Demo only. Do not enter a real token here. Authentication is disabled and no credentials are transmitted.",
};
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClientIntlProvider overrides={demoMessages}>
      <Providers>
        <div className="bg-topic px-4 py-3 text-center text-sm text-primary">
          Interactive demo · 演示数据 / Sample data · No real login or GitHub
          writes
        </div>
        <Discover initialQuery={location.search.slice(1)} />
      </Providers>
    </ClientIntlProvider>
  </React.StrictMode>,
);
