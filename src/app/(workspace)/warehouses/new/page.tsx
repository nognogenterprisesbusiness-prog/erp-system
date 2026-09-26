import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";

export default async function NewWarehousePage() {
  await requireManager();
  redirect("/warehouses?create=1");
}
