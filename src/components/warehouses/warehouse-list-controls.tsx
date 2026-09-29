import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { SearchField } from "@/components/ui/search-field";
import { SelectPicker } from "@/components/ui/select-picker";

export const warehouseListHeader = {
  eyebrow: "Inventory foundation",
  title: "Warehouses",
  description: "Manage storage locations and responsible personnel.",
} as const;

export function WarehouseListControls({ query = "", status = "all" }: { query?: string; status?: "all" | "active" | "inactive" }) {
  return <ListFilterBar viewKey="warehouses" viewTitle="Warehouses"><SearchField key={query} name="q" defaultValue={query} label="Search warehouses" placeholder="Search code, name, or address" /><SelectPicker name="status" label="Warehouse status" defaultValue={status} options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></ListFilterBar>;
}
