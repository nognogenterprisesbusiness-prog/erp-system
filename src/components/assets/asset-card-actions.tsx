"use client";

import { useState } from "react";
import { RecordActionMenu } from "@/components/ui/record-action-menu";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { AssetForm } from "./asset-form";
import { ArchiveAssetForm } from "./archive-asset-form";
import type { AssetLocationView, AssetView } from "@/lib/data/assets";
import type { AssetCategoryRow, AssetKind } from "@/types/database";

export function AssetCardActions({ asset, kind, canManage, categories, locations }: { asset: AssetView; kind: AssetKind; canManage: boolean; categories: AssetCategoryRow[]; locations: AssetLocationView[] }) {
  const [mode, setMode] = useState<"edit" | "remove" | null>(null);
  const base = kind === "equipment" ? "/equipment" : "/vehicles";
  const editable = canManage && !asset.archived_at && !["assigned", "in_use"].includes(asset.status);
  return <>
    <RecordActionMenu name={asset.name} actions={[
      { label: "View", href: `${base}/${asset.id}` },
      ...(editable ? [{ label: "Edit", onSelect: () => setMode("edit") }, { label: "Delete", destructive: true, onSelect: () => setMode("remove") }] : []),
    ]} />
    {mode && <RecordCreateDialog title={`${mode === "edit" ? "Edit" : "Delete"} ${kind}`} initialOpen hideTrigger onClosed={() => setMode(null)}>
      {mode === "edit" ? <AssetForm kind={kind} asset={asset} categories={categories} locations={locations} /> : <ArchiveAssetForm id={asset.id} kind={kind} />}
    </RecordCreateDialog>}
  </>;
}
