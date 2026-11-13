"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./button";

export function usePrintDocument() {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const printing = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; request.current?.abort(); frame.current?.remove(); clearTimeout(timer.current); };
  }, []);
  async function print(href: string) {
    if (printing.current) return;
    printing.current = true;
    setBusy(true); setError("");
    frame.current?.remove(); clearTimeout(timer.current);
    const controller = new AbortController();
    request.current = controller;
    timer.current = setTimeout(() => controller.abort(), 30000);
    const iframe = document.createElement("iframe");
    frame.current = iframe;
    iframe.title = "Print document";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.setAttribute("sandbox", "allow-same-origin allow-modals");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    const cleanup = () => { iframe.remove(); if (frame.current === iframe) frame.current = null; clearTimeout(timer.current); };
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) throw new Error("Invalid print destination.");
      const response = await fetch(url.href, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("This document is unavailable. Refresh and try again.");
      const source = new DOMParser().parseFromString(await response.text(), "text/html");
      const content = source.querySelector("[data-print-document]");
      if (!content) throw new Error("This document is unavailable or your session has expired. Refresh and try again.");
      const printable = document.implementation.createHTMLDocument("Nognog print label");
      printable.documentElement.className = source.documentElement.className;
      printable.body.className = source.body.className;
      const base = printable.createElement("base"); base.href = window.location.origin;
      printable.head.append(base);
      for (const style of source.querySelectorAll('style, link[rel="stylesheet"]')) {
        if (style instanceof HTMLLinkElement && new URL(style.getAttribute("href") ?? "", url).origin !== url.origin) continue;
        printable.head.append(style.cloneNode(true));
      }
      printable.body.append(content.cloneNode(true));
      printable.querySelectorAll("script").forEach(script => script.remove());
      printable.querySelectorAll("img").forEach(image => image.setAttribute("loading", "eager"));
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(new Error("Print preview could not finish. Please try again."));
        controller.signal.addEventListener("abort", abort, { once: true });
        iframe.onerror = () => reject(new Error("Print preview could not load."));
        iframe.onload = () => {
          const doc = iframe.contentDocument;
          if (!doc) { reject(new Error("Print preview is unavailable.")); return; }
          Promise.all([doc.fonts.ready, ...Array.from(doc.images, image => image.decode())])
            .then(() => { controller.signal.removeEventListener("abort", abort); resolve(); }, reject);
        };
        iframe.srcdoc = "<!doctype html>" + printable.documentElement.outerHTML;
        document.body.appendChild(iframe);
      });
      const printWindow = iframe.contentWindow;
      if (!printWindow) throw new Error("Print preview is unavailable.");
      if (!active.current || frame.current !== iframe) return;
      clearTimeout(timer.current);
      printWindow.addEventListener("afterprint", cleanup, { once: true });
      timer.current = setTimeout(cleanup, 120000);
      printWindow.focus(); printWindow.print();
    } catch (cause) {
      cleanup();
      if (active.current) setError(cause instanceof Error ? cause.message : "Printing could not start. Please try again.");
    } finally {
      printing.current = false;
      if (active.current) setBusy(false);
    }
  }
  return { print, busy, error };
}

export function PrintDocumentButton({ href, label = "Print" }: { href: string; label?: string }) {
  const { print, busy, error } = usePrintDocument();
  return <div><Button type="button" disabled={busy} onClick={() => void print(href)}>{busy ? "Preparing print…" : label}</Button>{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}</div>;
}
