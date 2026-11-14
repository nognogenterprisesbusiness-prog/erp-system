import { redirect } from "next/navigation";
import { requireManagerPage } from "@/lib/auth";

export default async function NewMaterialPage() {
  await requireManagerPage();
  redirect("/inventory?create=1");
}
