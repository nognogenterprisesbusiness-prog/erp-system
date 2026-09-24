import { AssetRegistryPage } from "@/components/assets/asset-registry-page";
export default function EquipmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <AssetRegistryPage kind="equipment" searchParams={searchParams} />; }
