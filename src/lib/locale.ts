import { locales, type Locale } from "@/types";

export function matchLocale(value: string): Locale {
  for (const item of value.split(",")) {
    const tag = item.split(";")[0].trim().toLowerCase();
    const match = locales.find(
      (locale) =>
        locale.toLowerCase() === tag ||
        locale.split("-")[0] === tag.split("-")[0],
    );
    if (match) return match;
  }
  return "en";
}

export function browserLocale(): Locale {
  const choice = document.cookie.match(
    /(?:^|;\s*)discover_locale=([^;]*)/,
  )?.[1];
  if (choice && locales.includes(choice as Locale)) return choice as Locale;
  return matchLocale(navigator.languages?.join(",") || navigator.language);
}
