"use client";

import NextLink from "next/link";
import { useState, type ComponentProps } from "react";

// Fetch the complete destination when navigation is likely, instead of fetching
// every visible link's loading boundary and then fetching its page on click.
export function IntentLink({ onMouseEnter, onFocus, onPointerDown, prefetch, ...props }: ComponentProps<typeof NextLink>) {
  const [ready, setReady] = useState(false);
  return <NextLink {...props} prefetch={prefetch === false ? false : ready}
    onMouseEnter={(event) => { setReady(true); onMouseEnter?.(event); }}
    onFocus={(event) => { setReady(true); onFocus?.(event); }}
    onPointerDown={(event) => { setReady(true); onPointerDown?.(event); }}
  />;
}
