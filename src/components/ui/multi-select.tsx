"use client";
import { useState } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "./button";
export function MultiSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string[];
  options: { value: string; label: string }[];
  onChange: (values: string[]) => void;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  return (
    <div className="min-w-0 flex-1">
      <Dropdown.Root onOpenChange={() => setQuery("")}>
        <Dropdown.Trigger asChild>
          <Button
            className="w-full justify-between bg-surface"
            aria-label={label}
          >
            {label}
            {value.length > 0 && (
              <span className="rounded-full bg-topic px-2 text-primary">
                {value.length}
              </span>
            )}
            <ChevronDown size={14} />
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            className="z-50 w-64 max-w-[90vw] rounded-2xl border border-border bg-surface p-2 shadow-xl"
            sideOffset={8}
            align="start"
          >
            <input
              className="control mb-2"
              aria-label={`${t("filterSearch")} ${label}`}
              placeholder={t("filterSearch")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation();
              }}
            />
            <div className="max-h-64 overflow-y-auto">
              {options
                .filter((o) =>
                  o.label.toLowerCase().includes(query.toLowerCase()),
                )
                .map((o) => (
                  <Dropdown.CheckboxItem
                    key={o.value}
                    checked={value.includes(o.value)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(checked) =>
                      onChange(
                        checked
                          ? [...value, o.value]
                          : value.filter((v) => v !== o.value),
                      )
                    }
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm outline-none data-[highlighted]:bg-hover"
                  >
                    <span className="w-4">
                      <Dropdown.ItemIndicator>
                        <Check size={15} />
                      </Dropdown.ItemIndicator>
                    </span>
                    {o.label}
                  </Dropdown.CheckboxItem>
                ))}
            </div>
            <Dropdown.Item
              className="cursor-pointer rounded-xl px-3 py-3 text-sm text-primary outline-none data-[highlighted]:bg-hover"
              onSelect={() => onChange([])}
            >
              {t("clear")}
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {value.map((v) => (
            <button
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-topic px-2 py-1 text-xs text-primary"
              key={v}
              onClick={() => onChange(value.filter((x) => x !== v))}
              aria-label={`${t("remove")} ${options.find((o) => o.value === v)?.label ?? v}`}
            >
              {options.find((o) => o.value === v)?.label ?? v}
              <X size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
