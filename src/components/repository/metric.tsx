import { useLocale } from "next-intl";
export function Metric({ value, label }: { value: number; label: string }) {
  const locale = useLocale();
  const tier =
    value >= 10000
      ? "violet"
      : value >= 1000
        ? "blue"
        : value >= 100
          ? "teal"
          : "quiet";
  return (
    <div title={`${label}: ${new Intl.NumberFormat(locale).format(value)}`}>
      <span
        className={`metric-${tier} block text-2xl font-bold tracking-tight tabular-nums`}
      >
        {new Intl.NumberFormat(locale, {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(value)}
      </span>
      <span className="mt-1 block text-xs font-medium text-muted">{label}</span>
    </div>
  );
}
