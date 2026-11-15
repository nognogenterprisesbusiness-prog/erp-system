"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Used by @modal intercepts for full-page tools such as "/requests/new". These static intercepts exist so the
 * sibling "[id]" record panel does not capture "new", but an intercepted navigation keeps the previous page on
 * screen. Load the real page instead.
 */
export function FullPageRoute() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    window.location.replace(`${pathname}${search ? `?${search}` : ""}`);
  }, [pathname, search]);
  return <span role="status" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 animate-pulse bg-cyan-600 motion-reduce:animate-none"><span className="sr-only">Loading page</span></span>;
}
