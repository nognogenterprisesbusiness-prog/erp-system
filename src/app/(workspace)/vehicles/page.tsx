import { AssetRegistryPage } from "@/components/assets/asset-registry-page";
export default function VehiclesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <AssetRegistryPage kind="vehicle" searchParams={searchParams} />; }
