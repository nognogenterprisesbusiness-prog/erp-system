import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";

export default async function NewSupplierPage() {
  await requireManager();
  redirect("/suppliers?create=1");
}
