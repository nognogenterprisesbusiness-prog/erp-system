"use client";

import { useEffect, useRef, useState } from "react";
import { Moon02Icon, PaintBrush01Icon, Sun01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const key = "nognog.theme";
type Theme = "light" | "blue" | "dark";
const options = [
  { value: "light", label: "Light", swatch: "#f5f6f8", icon: Sun01Icon },
  { value: "blue", label: "Blue dark", swatch: "#142136", icon: Moon02Icon },
  { value: "dark", label: "Charcoal", swatch: "#1b1d20", icon: Moon02Icon },
] as const;

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const menu = useRef<HTMLDetailsElement>(null);

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
    queueMicrotask(readTheme);
    window.addEventListener("storage", readTheme);
    return () => window.removeEventListener("storage", readTheme);
  }, []);

  function selectTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
    try { window.localStorage.setItem(key, next); } catch { /* The theme still works for this page. */ }
    if (menu.current) menu.current.open = false;
  }

  return <details ref={menu} data-header-menu="theme" className="relative">
    <summary aria-label={`Appearance: ${options.find((option) => option.value === theme)?.label}`} title="Choose appearance" className="grid size-10 cursor-pointer list-none place-items-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 [&::-webkit-details-marker]:hidden">
      <HugeiconsIcon icon={PaintBrush01Icon} size={19} strokeWidth={1.7} />
    </summary>
    <div className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
      <p className="px-2.5 pb-2 pt-1 text-xs font-semibold text-slate-500">Appearance</p>
      <div role="group" aria-label="Appearance theme" className="grid gap-1">
        {options.map((option) => <button key={option.value} type="button" aria-label={option.label} aria-pressed={theme === option.value} onClick={() => selectTheme(option.value)} className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${theme === option.value ? "bg-slate-50 font-semibold text-slate-900" : "text-slate-600"}`}>
          <span className="grid size-7 shrink-0 place-items-center rounded-full border border-slate-200" style={{ backgroundColor: option.swatch, color: option.value === "light" ? "#344054" : "#f8fafc" }}><HugeiconsIcon icon={option.icon} size={15} strokeWidth={1.6} /></span>
          <span className="flex-1">{option.label}</span>
          {theme === option.value && <HugeiconsIcon icon={Tick02Icon} size={16} className="text-cyan-700" aria-hidden="true" />}
        </button>)}
      </div>
    </div>
  </details>;
}
