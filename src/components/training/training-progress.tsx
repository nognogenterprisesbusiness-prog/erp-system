"use client";

import { useSyncExternalStore } from "react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

// Training is public and needs no account, so "done" marks live only in this browser.
const storageKey = "nognog-training-done";
const listeners = new Set<() => void>();

function read(): string {
  try { return window.localStorage.getItem(storageKey) ?? "[]"; } catch { return "[]"; }
}
function doneSet(raw: string) {
  try { const value: unknown = JSON.parse(raw); return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []); } catch { return new Set<string>(); }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}
function useDone() {
  return doneSet(useSyncExternalStore(subscribe, read, () => "[]"));
}
function setDone(key: string, done: boolean) {
  const next = doneSet(read());
  if (done) next.add(key); else next.delete(key);
  try { window.localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* private mode: marks are optional */ }
  listeners.forEach((listener) => listener());
}

export function LessonDoneBadge({ lessonKey }: { lessonKey: string }) {
  const done = useDone().has(lessonKey);
  return done ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />Watched</span> : null;
}

export function CourseProgress({ lessonKeys }: { lessonKeys: string[] }) {
  const done = useDone();
  const count = lessonKeys.filter((key) => done.has(key)).length;
  const percent = lessonKeys.length ? Math.round((count / lessonKeys.length) * 100) : 0;
  return <div aria-label={`${count} of ${lessonKeys.length} lessons watched`}>
    <div className="flex items-center justify-between text-xs font-medium text-slate-600"><span>Your progress</span><span>{count} of {lessonKeys.length} watched</span></div>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-cyan-600 transition-[width]" style={{ width: `${percent}%` }} /></div>
  </div>;
}

export function LessonDoneButton({ lessonKey }: { lessonKey: string }) {
  const done = useDone().has(lessonKey);
  return <Button type="button" variant={done ? "outline" : "default"} onClick={() => setDone(lessonKey, !done)} aria-pressed={done}>
    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={17} />{done ? "Watched · tap to undo" : "I watched this lesson"}
  </Button>;
}
