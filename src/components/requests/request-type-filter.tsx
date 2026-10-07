import { SelectPicker } from "@/components/ui/select-picker";

export type RequestType = "all" | "material" | "equipment" | "vehicle";

const types: { value: RequestType; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "material", label: "Materials" },
  { value: "equipment", label: "Equipment" },
  { value: "vehicle", label: "Vehicles" },
];

export function RequestTypeFilter({ showAssets = true, defaultValue = "all" }: { showAssets?: boolean; defaultValue?: RequestType }) {
  return <SelectPicker name="type" label="Request type" defaultValue={defaultValue} options={types.filter(({ value }) => value === "all" || value === "material" || showAssets)} />;
}
