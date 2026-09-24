import { AssetEditorPage } from "@/components/assets/asset-editor-page";
export default async function EditEquipmentPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AssetEditorPage kind="equipment" id={id} />; }
