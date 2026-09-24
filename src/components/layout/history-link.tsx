"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";

type HistoryLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

export function HistoryLink({ href, onClick, ...props }: HistoryLinkProps) {
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target || props.download) return;
    event.preventDefault();
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, "", href);
  }

  return <a href={href} onClick={navigate} {...props} />;
}
