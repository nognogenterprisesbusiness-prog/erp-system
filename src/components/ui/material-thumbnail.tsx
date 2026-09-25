import Image from "next/image";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function MaterialThumbnail({ name, photo, large = false }: { name: string; photo?: string | null; large?: boolean }) {
  return <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-400 ${large ? "size-16" : "size-12"}`}>
    {photo ? <Image src={photo} alt={`${name} photo`} fill sizes={large ? "64px" : "48px"} unoptimized={photo.startsWith("data:") || photo.startsWith("/record-photos/")} className="object-cover" /> : <HugeiconsIcon icon={PackageIcon} size={large ? 27 : 21} aria-hidden="true" />}
  </span>;
}
