"use client";

import { useEffect, useState } from "react";
import { ContrastIcon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const key = "nognog.theme";
type Theme = "light" | "blue" | "dark";
const options = [
  { value: "light", label: "Light", icon: Sun01Icon },
  { value: "blue", label: "Blue dark", icon: Moon02Icon },
  { value: "dark", label: "Charcoal", icon: ContrastIcon },
] as const;

function nextTheme(theme: Theme): Theme {
  return options[(options.findIndex((option) => option.value === theme) + 1) % options.length].value;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

function useAppearance() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const readTheme = () => {
      let saved: Theme = "light";
      try {
        const stored = window.localStorage.getItem(key);
        saved = stored === "dark" || stored === "blue" ? stored : "light";
      } catch { /* Storage can be disabled. */ }
      setTheme(saved);
      applyTheme(saved);
    };
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<Theme>).detail;
      if (next === "light" || next === "blue" || next === "dark") setTheme(next);
    };
    queueMicrotask(readTheme);
    window.addEventListener("storage", readTheme);
    window.addEventListener("nognog-theme-change", onThemeChange);
    return () => { window.removeEventListener("storage", readTheme); window.removeEventListener("nognog-theme-change", onThemeChange); };
  }, []);
  function selectTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
    try { window.localStorage.setItem(key, next); } catch { /* The theme still works for this page. */ }
    window.dispatchEvent(new CustomEvent<Theme>("nognog-theme-change", { detail: next }));
  }
  return { theme, selectTheme };
}

export function ThemeSettings() {
  const { theme, selectTheme } = useAppearance();
  const current = options.find((option) => option.value === theme) ?? options[0];
  const next = options.find((option) => option.value === nextTheme(theme)) ?? options[1];
  return <button type="button" onClick={() => selectTheme(next.value)} aria-label={`Appearance: ${current.label}. Switch to ${next.label}`} className="mt-4 inline-flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-800 hover:border-cyan-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><HugeiconsIcon icon={current.icon} size={19} strokeWidth={1.7} aria-hidden="true" /><span>{current.label}</span><span className="text-xs font-normal text-slate-500">Switch to {next.label}</span></button>;
}

export function ThemeToggle() {
  const { theme, selectTheme } = useAppearance();
  const current = options.find((option) => option.value === theme) ?? options[0];
  const next = options.find((option) => option.value === nextTheme(theme)) ?? options[1];
  return <button type="button" onClick={() => selectTheme(next.value)} aria-label={`Appearance: ${current.label}. Switch to ${next.label}`} title={`Switch to ${next.label}`} className="grid size-10 place-items-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><HugeiconsIcon icon={current.icon} size={19} strokeWidth={1.7} aria-hidden="true" /></button>;
}
