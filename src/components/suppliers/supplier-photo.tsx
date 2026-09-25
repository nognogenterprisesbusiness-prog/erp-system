import Image from "next/image";
import { Store02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

export function SupplierPhoto({ name, photo, className = "size-12", sizes = "48px" }: {
  name: string; photo?: string | null; className?: string; sizes?: string;
}) {
  return <span className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-400", className)}>
    {photo ? <Image src={photo} alt={`${name} photo`} fill sizes={sizes} unoptimized className="object-cover" />
      : <HugeiconsIcon icon={Store02Icon} size={22} aria-hidden="true" />}
  </span>;
}
