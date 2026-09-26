import type { ComponentProps } from "react";
import { PhotoViewer } from "./photo-viewer";
import { Building03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function RecordThumbnail({ name, photo, icon = Building03Icon }: { name: string; photo?: string | null; icon?: ComponentProps<typeof HugeiconsIcon>["icon"] }) {
  return <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
    {photo ? <PhotoViewer src={photo} alt={`${name} photo`} sizes="48px" /> : <HugeiconsIcon icon={icon} size={22} strokeWidth={1.5} aria-label="No photo uploaded" />}
  </span>;
}
