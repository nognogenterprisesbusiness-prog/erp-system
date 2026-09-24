import { redirect } from "next/navigation";
import { WarehouseForm } from "@/components/warehouses/warehouse-form";
import { requireUser } from "@/lib/auth";
import { getWarehouse } from "@/lib/data/warehouses";
import { municipalityDisplay } from "@/lib/locations";
export default async function EditWarehousePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const user = await requireUser(); if (!user.canManage) redirect(`/warehouses/${id}`); const { warehouse } = await getWarehouse(id); return <><div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">{warehouse.code}</p><h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em]">Edit warehouse</h1></div><WarehouseForm warehouse={warehouse} municipalityLabel={municipalityDisplay(warehouse.municipality_code ?? undefined, "")} /></>; }
