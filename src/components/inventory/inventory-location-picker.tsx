"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SelectPicker } from "@/components/ui/select-picker";
import { inventoryScopeLabel, type InventoryScope } from "@/lib/inventory/scope";

export function InventoryLocationPicker({ locations, value, scope }: { locations: { id: string; name: string; location_type: string }[]; value: string; scope?: InventoryScope }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const summaryScopes: InventoryScope[] = scope ? [
    ...(locations.some((location) => location.location_type === "warehouse") ? ["warehouses" as const] : []),
    ...(locations.some((location) => location.location_type === "project_site") ? ["sites" as const] : []),
    "overview",
  ] : ["overview"];
  if (scope && !summaryScopes.includes(scope)) summaryScopes.unshift(scope);
  const options = [...summaryScopes.map((value) => ({ value, label: inventoryScopeLabel(value) })),
    ...locations.map((location) => ({ value: location.id, label: `${location.name} · ${location.location_type === "project_site" ? "Site" : "Warehouse"}` }))];
  return <div className="w-full min-w-[190px] sm:w-[240px]"><SelectPicker label="Stock location" value={value || scope || "overview"} options={options} onValueChange={(locationId) => {
      const next = new URLSearchParams(searchParams.toString());
      if (summaryScopes.includes(locationId as InventoryScope)) {
        next.delete("location");
        if (scope) next.set("scope", locationId);
        else next.delete("scope");
      } else next.set("location", locationId);
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }} /></div>;
}
