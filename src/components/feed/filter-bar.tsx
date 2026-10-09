"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { categories, languages } from "@/types";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export interface FilterValues {
  language: string;
  category: string;
  sort: string;
  period: string;
  minStars: string;
  license: string;
  created: string;
  updated: string;
}
export const defaultFilters: FilterValues = {
  language: "",
  category: "all",
  sort: "recommended",
  period: "week",
  minStars: "0",
  license: "",
  created: "",
  updated: "",
};
export function FilterBar({
  values,
  onChange,
  trending,
}: {
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  trending: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(values);
  const change = (key: keyof FilterValues, value: string) =>
    onChange({ ...values, [key]: value });
  const edit = (key: keyof FilterValues, value: string) =>
    setDraft({ ...draft, [key]: value });
  const count = [
    Number(values.minStars) > 0,
    Boolean(values.license),
    Boolean(values.created),
    Boolean(values.updated),
  ].filter(Boolean).length;
  return (
    <div className="flex flex-wrap items-start gap-2">
      <MultiSelect
        label={t("language")}
        value={values.language.split(",").filter(Boolean)}
        options={languages.map((value) => ({
          value,
          label: value === "Other" ? t("Other") : value,
        }))}
        onChange={(v) => change("language", v.join(","))}
      />
      <MultiSelect
        label={t("category")}
        value={values.category === "all" ? [] : values.category.split(",")}
        options={categories
          .filter((v) => v !== "all")
          .map((value) => ({ value, label: t(value) }))}
        onChange={(v) => change("category", v.join(",") || "all")}
      />
      <label className="min-w-0 flex-1">
        <span className="sr-only">{t("sort")}</span>
        <select
          className="control"
          aria-label={t("sort")}
          value={values.sort}
          onChange={(e) => change("sort", e.target.value)}
        >
          {["recommended", "created", "updated", "stars", "growth"].map((v) => (
            <option key={v} value={v}>
              {t(v === "stars" ? "mostStars" : v)}
            </option>
          ))}
        </select>
      </label>
      <Button
        aria-label={t("advanced")}
        className={count ? "text-primary" : ""}
        onClick={() => {
          setDraft(values);
          setOpen(true);
        }}
      >
        <SlidersHorizontal size={17} />
        {count > 0 && <span>{count}</span>}
      </Button>
      {trending && (
        <select
          className="control w-auto"
          aria-label={t("period")}
          value={values.period}
          onChange={(e) => change("period", e.target.value)}
        >
          {["day", "week", "month"].map((v) => (
            <option key={v} value={v}>
              {t(v)}
            </option>
          ))}
        </select>
      )}
      {(count > 0 ||
        values.language ||
        values.category !== "all" ||
        values.sort !== "recommended") && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("clear")}
          onClick={() => onChange(defaultFilters)}
        >
          <X size={16} />
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="text-xl font-semibold">
            {t("advanced")}
          </DialogTitle>
          <DialogDescription className="mt-2 mb-6 text-sm text-muted">
            {t("advancedHint")}
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onChange({
                ...values,
                minStars: draft.minStars || "0",
                license: draft.license,
                created: draft.created,
                updated: draft.updated,
              });
              setOpen(false);
            }}
          >
            <label className="block text-sm font-medium">
              {t("minStars")}
              <input
                className="control mt-2"
                type="number"
                min="0"
                max="999999999"
                step="1"
                value={draft.minStars}
                onChange={(e) => edit("minStars", e.target.value)}
              />
            </label>
            <div className="my-3 flex flex-wrap gap-2">
              {[0, 100, 1000, 10000].map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  aria-pressed={Number(draft.minStars) === n}
                  className={
                    Number(draft.minStars) === n
                      ? "border-primary text-primary"
                      : ""
                  }
                  onClick={() => edit("minStars", String(n))}
                >
                  {n === 0 ? t("anyValue") : `${n.toLocaleString()}+`}
                </Button>
              ))}
            </div>
            <label className="my-5 block text-sm font-medium">
              {t("license")}
              <select
                className="control mt-2"
                value={draft.license}
                onChange={(e) => edit("license", e.target.value)}
              >
                <option value="">{t("anyLicense")}</option>
                {[
                  "mit",
                  "apache-2.0",
                  "gpl-3.0",
                  "bsd-3-clause",
                  "unlicense",
                ].map((v) => (
                  <option key={v} value={v}>
                    {v.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(["created", "updated"] as const).map((key) => (
                <label key={key} className="min-w-0 text-sm font-medium">
                  {t(key === "created" ? "createdAfter" : "updatedAfter")}
                  <input
                    type="date"
                    className="control mt-2"
                    value={draft[key]}
                    onChange={(e) => edit(key, e.target.value)}
                  />
                  <div className="mt-2 flex gap-2">
                    {[30, 90].map((days) => (
                      <button
                        type="button"
                        key={days}
                        className="rounded-full bg-topic px-3 py-2 text-xs text-primary"
                        onClick={() =>
                          edit(
                            key,
                            new Date(Date.now() - days * 86400000)
                              .toISOString()
                              .slice(0, 10),
                          )
                        }
                      >
                        {t("lastDays", { days })}
                      </button>
                    ))}
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-border pt-5">
              <Button
                variant="ghost"
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    minStars: "0",
                    license: "",
                    created: "",
                    updated: "",
                  })
                }
              >
                {t("reset")}
              </Button>
              <div className="flex-1" />
              <Button type="button" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" variant="primary">
                {t("apply")}
                {count > 0 && ` · ${count}`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
