import { useTranslations } from "next-intl";
export function FeedSkeleton() {
  const t = useTranslations();
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 min-[1440px]:grid-cols-4"
      role="status"
      aria-label={t("loading")}
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div
          className="overflow-hidden rounded-xl border border-border bg-surface"
          key={index}
        >
          <div className="space-y-5 p-5">
            <div className="flex justify-between">
              <div className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-control" />
                <div className="h-7 w-36 animate-pulse rounded bg-control" />
              </div>
              <div className="h-12 w-12 animate-pulse rounded-lg bg-control" />
            </div>
            <div className="space-y-2 pt-4">
              <div className="h-4 w-full animate-pulse rounded bg-control" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-control" />
            </div>
            <div className="flex gap-12 py-3">
              <div className="h-9 w-12 animate-pulse rounded bg-control" />
              <div className="h-9 w-12 animate-pulse rounded bg-control" />
            </div>
          </div>
          <div className="space-y-4 border-t border-border p-5">
            <div className="h-5 w-4/5 animate-pulse rounded bg-control" />
            <div className="h-14 w-full animate-pulse rounded bg-control" />
            <div className="h-6 w-3/5 animate-pulse rounded bg-control" />
          </div>
        </div>
      ))}
    </div>
  );
}
