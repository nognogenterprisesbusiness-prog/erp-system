import { redirect } from "next/navigation";
import { requireWorkforceManagerPage } from "@/lib/auth";

export default async function NewEmployeePage() {
  await requireWorkforceManagerPage();
  redirect("/employees?create=1");
}
