import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { uuidSchema } from "@nognog/domain";
import { notFound } from "next/navigation";
import type { AssetKind } from "@/types/database";

export async function AssetEditorPage({ kind, id }: { kind: AssetKind; id?: string }): Promise<never> {
  await requireManager();
  const base = kind === "equipment" ? "/equipment" : "/vehicles";
  if (!id) redirect(`${base}?create=1`);
  if (!uuidSchema.safeParse(id).success) notFound();
  return redirect(`${base}/${id}?edit=1`);
}
