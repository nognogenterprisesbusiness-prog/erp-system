"use client";

import { useState } from "react";
import { CopyLinkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";

export function ShareProjectButton({ href }: { href: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).toString());
      setMessage("Link copied. The recipient still needs project access.");
    } catch {
      setMessage("Could not copy the link in this browser.");
    }
  }
  return <div className="relative"><Button type="button" variant="outline" onClick={() => void copy()}><HugeiconsIcon icon={CopyLinkIcon} size={16} />Share</Button>{message && <span role="status" className="absolute right-0 top-full z-10 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg">{message}</span>}</div>;
}
