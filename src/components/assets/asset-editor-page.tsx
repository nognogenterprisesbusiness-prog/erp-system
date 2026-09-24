import Link from "next/link";
import { AssetForm } from "@/components/assets/asset-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireManager } from "@/lib/auth";
import { getAsset, getAssetReferences } from "@/lib/data/assets";
import type { AssetKind } from "@/types/database";
export async function AssetEditorPage({ kind, id }: { kind: AssetKind; id?: string }) {
  await requireManager();
  const [references, data] = await Promise.all([getAssetReferences(kind), id ? getAsset(id, kind) : Promise.resolve(undefined)]);
  const label = kind === "equipment" ? "equipment" : "vehicle";
  const base = kind === "equipment" ? "/equipment" : "/vehicles";
  if (data && ["assigned", "in_use"].includes(data.asset.status)) return <>
    <PageHeader title={`${data.asset.name} is assigned`} description="An assigned asset cannot be released or relocated from the registry editor. Its handover must be recorded first." action={<Button variant="outline" asChild><Link href={`${base}/${id}`}>Back to asset</Link></Button>} />
  </>;
  return <><PageHeader eyebrow={`${label} registry`} title={id ? `Edit ${data?.asset.name}` : `Add ${label}`} description="Registry changes are validated by the server and recorded in the asset history." action={<Button variant="outline" asChild><Link href={id ? `${base}/${id}` : base}>Cancel</Link></Button>} /><div className="mt-7 max-w-4xl"><AssetForm kind={kind} asset={data?.asset} {...references} /></div></>;
}
