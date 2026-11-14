import { redirect } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { requireWorkforceManagerPage } from "@/lib/auth";

export default async function EmployeeCategoriesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireWorkforceManagerPage();
  const edit = uuidSchema.safeParse((await searchParams).edit);
  redirect(`/employees?manageTrades=1${edit.success ? `&editTrade=${edit.data}` : ""}`);
}
