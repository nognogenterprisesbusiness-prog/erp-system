import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";

export default async function NewEmployeePage() {
  await requireManager();
  redirect("/employees?create=1");
}
