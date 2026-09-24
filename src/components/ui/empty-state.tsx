import Image from "next/image";
import { cn } from "@/lib/utils";

const illustrations = { data: "/no-data.webp", items: "/no-items.webp", notifications: "/no-notifications.webp", results: "/no-results.webp" } as const;

export function EmptyState({ title, description, kind = "data", compact = false, className }: { title: string; description?: string; kind?: keyof typeof illustrations; compact?: boolean; className?: string }) {
  return <div className={cn("flex flex-col items-center px-5 text-center", compact ? "py-4" : "py-8", className)}>
    <Image src={illustrations[kind]} alt="" aria-hidden="true" width={240} height={240} sizes={compact ? "96px" : "(max-width: 640px) 160px, 192px"} className={compact ? "h-auto w-20 sm:w-24" : "h-auto w-40 sm:w-48"} />
    <p className={cn("text-sm font-semibold text-slate-800", compact ? "mt-2" : "mt-4")}>{title}</p>
    {description ? <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p> : null}
  </div>;
}
