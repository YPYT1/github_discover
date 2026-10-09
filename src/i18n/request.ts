import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
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
export default getRequestConfig(async () => {
  const choice = (await cookies()).get("discover_locale")?.value;
  const locale =
    choice && locales.some((l) => l === choice)
      ? (choice as Locale)
      : matchLocale((await headers()).get("accept-language") ?? "en");
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
