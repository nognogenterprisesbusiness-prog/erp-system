"use client";

import { useRef, useTransition, type ComponentProps } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { RecordListViewToggle } from "./record-list-view";
import { FilterBarContext } from "./filter-bar-context";

type ListFilterBarProps = ComponentProps<"form"> & { viewKey?: string; viewTitle?: string };

export function ListFilterBar({ className, children, viewKey, viewTitle, ...props }: ListFilterBarProps) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  function navigate(includeDraftSearch: boolean, name?: string, value?: string) {
    if (!form.current) return;
    const params = new URLSearchParams();
    for (const [key, entry] of new FormData(form.current)) {
      if (typeof entry === "string" && entry && entry !== "all" && key !== "page") {
        params.set(key, entry);
      }
    }
    if (!includeDraftSearch) {
      const committed = new URLSearchParams(window.location.search);
      for (const input of form.current.querySelectorAll<HTMLInputElement>('input[type="search"][name]')) {
        const current = committed.get(input.name);
        if (current) params.set(input.name, current);
        else params.delete(input.name);
      }
    }
    if (name) {
      if (value && value !== "all") params.set(name, value);
      else params.delete(name);
    }
    const href = `${pathname}${params.size ? `?${params}` : ""}`;
    if (href === `${window.location.pathname}${window.location.search}`) return;
    startTransition(() => router.replace(href, { scroll: false }));
  }
  return <FilterBarContext.Provider value={(name, value) => navigate(false, name, value)}>
    <form
      {...props}
      ref={form}
      aria-busy={pending}
      onSubmit={(event) => { event.preventDefault(); navigate(true); }}
      onChange={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)
          || !target.name
          || (target instanceof HTMLInputElement && ["search", "hidden"].includes(target.type))) return;
        navigate(false);
      }}
      className={cn("mt-7 flex flex-wrap items-center gap-3 [&>button[role=combobox]]:w-full sm:[&>button[role=combobox]]:w-44", className)}
    >
      {children}
      {viewKey && <RecordListViewToggle storageKey={viewKey} title={viewTitle ?? viewKey} />}
    </form>
  </FilterBarContext.Provider>;
}
