import { redirect } from "next/navigation";
import { requireManagerPage } from "@/lib/auth";

export default async function NewSupplierPage() {
  await requireManagerPage();
  redirect("/suppliers?create=1");
}
