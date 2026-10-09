"use client";

import { useEffect } from "react";

type Topic = { id: string; title: string };

function expandTopic(id: string) {
  const section = document.getElementById(id);
  if (section instanceof HTMLDetailsElement) section.open = true;
}

export function ManualTopics({ topics }: { topics: Topic[] }) {
  useEffect(() => {
    function followBookmark() {
      let id: string;
      try { id = decodeURIComponent(window.location.hash.slice(1)); }
      catch { return; }
      if (!topics.some((topic) => topic.id === id)) return;
      expandTopic(id);
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    }
    followBookmark();
    window.addEventListener("hashchange", followBookmark);
    return () => window.removeEventListener("hashchange", followBookmark);
  }, [topics]);

  return <nav aria-label="Manual topics" className="mt-5 flex flex-wrap gap-2">
    {topics.map((topic) => <a key={topic.id} href={`#${topic.id}`} onClick={() => expandTopic(topic.id)} className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">{topic.title}</a>)}
  </nav>;
}
