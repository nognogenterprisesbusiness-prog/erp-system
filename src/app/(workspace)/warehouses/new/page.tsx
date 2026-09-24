import { redirect } from "next/navigation";
import { WarehouseForm } from "@/components/warehouses/warehouse-form";
import { requireUser } from "@/lib/auth";
export default async function NewWarehousePage() { const user = await requireUser(); if (!user.canManage) redirect("/warehouses"); return <><div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Inventory foundation</p><h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em]">Create warehouse</h1><p className="mt-1 text-sm text-slate-500">Create an inventory-ready storage location.</p></div><WarehouseForm /></>; }
