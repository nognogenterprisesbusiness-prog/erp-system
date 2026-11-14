import { redirect } from "next/navigation";
import { requireManagerPage } from "@/lib/auth";

export default async function NewWarehousePage() {
  await requireManagerPage();
  redirect("/warehouses?create=1");
}
