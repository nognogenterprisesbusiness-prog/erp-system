"use client";

import { useEffect, useRef, useTransition, type ComponentProps } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { FilterBarContext } from "./filter-bar-context";

export function ListFilterBar({ className, ...props }: ComponentProps<"form">) {
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  useEffect(() => () => clearTimeout(timer.current), []);
  function navigate(name?: string, value?: string, delay = 0) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!form.current) return;
      const params = new URLSearchParams();
      for (const [key, entry] of new FormData(form.current)) if (typeof entry === "string" && entry && entry !== "all" && key !== "page") params.set(key, entry);
      if (name) { if (value && value !== "all") params.set(name, value); else params.delete(name); }
      const href = `${pathname}${params.size ? `?${params}` : ""}`;
      if (href === `${window.location.pathname}${window.location.search}`) return;
      startTransition(() => router.replace(href, { scroll: false }));
    }, delay);
  }
  return <FilterBarContext.Provider value={(name, value) => navigate(name, value)}><form {...props} ref={form} aria-busy={pending} onSubmit={(event) => { event.preventDefault(); navigate(); }} onChange={(event) => { const target = event.target; if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) || !target.name) return; navigate(undefined, undefined, target instanceof HTMLInputElement && target.type === "search" ? 300 : 0); }} className={cn("mt-7 flex flex-wrap items-center gap-3 [&>button[role=combobox]]:w-full sm:[&>button[role=combobox]]:w-44", className)} /></FilterBarContext.Provider>;
}
