"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SelectPicker } from "@/components/ui/select-picker";

export function InventoryLocationPicker({ locations, value }: { locations: { id: string; name: string; location_type: string }[]; value: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const options = [{ value: "all", label: "All locations" }, ...locations.map((location) => ({ value: location.id, label: `${location.name}${location.location_type === "project_site" ? " · Site" : ""}` }))];
  return <div className="w-full min-w-[190px] sm:w-[240px]"><SelectPicker label="Stock location" value={value || "all"} options={options} disabled={!options.length} onValueChange={(locationId) => {
      const next = new URLSearchParams(searchParams.toString());
      if (locationId === "all") next.delete("location");
      else next.set("location", locationId);
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    }} /></div>;
}
