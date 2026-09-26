"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function AccountAvatar({ name, photo, className }: { name: string; photo?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span aria-hidden="true" className={cn("relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-xs font-medium text-slate-600", className)}>{photo && !failed ? <Image src={photo} alt="" fill sizes="36px" unoptimized className="object-cover" onError={() => setFailed(true)} /> : initials}</span>;
}
