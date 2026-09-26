import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";

export default async function NewMaterialPage() {
  await requireManager();
  redirect("/materials?create=1");
}
