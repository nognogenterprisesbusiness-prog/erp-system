"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useWorkspaceHeader } from "@/components/layout/workspace-shell";
import { SelectPicker } from "@/components/ui/select-picker";

export function InventoryLocationPicker({ locations, value }: { locations: { id: string; name: string; location_type: string }[]; value: string }) {
  const setHeader = useWorkspaceHeader();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const options = useMemo(() => locations.map((location) => ({ value: location.id, label: `${location.name}${location.location_type === "project_site" ? " · Site" : ""}` })), [locations]);

  useEffect(() => {
    if (!options.length) { setHeader(null); return; }
    setHeader(<SelectPicker label="Stock location" value={value} options={options} onValueChange={(locationId) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("location", locationId);
      router.push(`${pathname}?${next.toString()}`);
    }} className="h-9 bg-slate-50 text-xs font-medium" />);
    return () => setHeader(null);
  }, [options, pathname, router, searchParams, setHeader, value]);

  return null;
}
