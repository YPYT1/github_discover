import type { Metadata } from "next";
import { ClientIntlProvider } from "@/components/client-intl-provider";
import { Providers } from "@/components/providers";
import "./globals.css";
export const metadata: Metadata = {
  title: "GitHub Discover",
  description: "Discover real GitHub open-source repositories.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ClientIntlProvider>
          <Providers>{children}</Providers>
        </ClientIntlProvider>
      </body>
    </html>
  );
}
