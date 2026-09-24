import { AssetEditorPage } from "@/components/assets/asset-editor-page";
export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AssetEditorPage kind="vehicle" id={id} />; }
