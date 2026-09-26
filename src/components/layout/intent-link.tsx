"use client";

import NextLink, { useLinkStatus } from "next/link";
import { useState, type ComponentProps } from "react";

// Fetch the complete destination when navigation is likely, instead of fetching
// every visible link's loading boundary and then fetching its page on click.
function NavigationHint() {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 animate-pulse bg-cyan-600 motion-reduce:animate-none"><span className="sr-only">Loading page</span></span> : null;
}

export function IntentLink({ onMouseEnter, onFocus, onPointerDown, prefetch, children, ...props }: ComponentProps<typeof NextLink>) {
  const [ready, setReady] = useState(false);
  return <NextLink {...props} prefetch={prefetch === false ? false : ready}
    onMouseEnter={(event) => { setReady(true); onMouseEnter?.(event); }}
    onFocus={(event) => { setReady(true); onFocus?.(event); }}
    onPointerDown={(event) => { setReady(true); onPointerDown?.(event); }}
  >{children}<NavigationHint /></NextLink>;
}
