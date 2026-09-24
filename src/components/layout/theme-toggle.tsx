"use client";

import { useEffect, useState } from "react";
import { Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

const key = "nognog.theme";
type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const readTheme = () => {
      let saved: Theme = "light";
      try { saved = window.localStorage.getItem(key) === "dark" ? "dark" : "light"; } catch { /* Storage can be disabled. */ }
      setTheme(saved);
      applyTheme(saved);
    };
    queueMicrotask(readTheme);
    window.addEventListener("storage", readTheme);
    return () => window.removeEventListener("storage", readTheme);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try { window.localStorage.setItem(key, next); } catch { /* The theme still works for this page. */ }
  }

  return <Button type="button" size="icon" variant="ghost" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-pressed={theme === "dark"}>
    <HugeiconsIcon icon={theme === "dark" ? Sun01Icon : Moon02Icon} size={19} />
  </Button>;
}
