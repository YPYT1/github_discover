import type { Locale } from "@/types";
export function persistLocale(locale: Locale) {
  document.cookie = `discover_locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  window.dispatchEvent(new Event("discover-locale"));
}
