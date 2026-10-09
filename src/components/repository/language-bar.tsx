import { useTranslations } from "next-intl";
export const languageColors: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  Rust: "#dea584",
  Go: "#00add8",
  Java: "#b07219",
  "C++": "#f34b7d",
  "C#": "#178600",
  Swift: "#f05138",
  Kotlin: "#a97bff",
  HTML: "#e34c26",
  CSS: "#663399",
  Shell: "#89e051",
  Ruby: "#701516",
  PHP: "#4f5d95",
  C: "#555555",
  Vue: "#41b883",
  Svelte: "#ff3e00",
};
export function LanguageBar({
  languages,
}: {
  languages?: Record<string, number>;
}) {
  const t = useTranslations();
  if (!languages) return null;
  const total = Object.values(languages).reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  return (
    <div
      className="flex h-1.5 w-full overflow-hidden"
      role="img"
      aria-label={`${t("languages")}: ${Object.entries(languages)
        .map(
          ([name, value]) => `${name} ${((value / total) * 100).toFixed(1)}%`,
        )
        .join(", ")}`}
    >
      {Object.entries(languages).map(([name, value]) => (
        <span
          key={name}
          style={{
            width: `${(value / total) * 100}%`,
            backgroundColor: languageColors[name] ?? "#8b949e",
          }}
          title={`${name} ${((value / total) * 100).toFixed(1)}%`}
        />
      ))}
    </div>
  );
}
