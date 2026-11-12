import { redirect } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { requireManager } from "@/lib/auth";

export default async function EmployeeCategoriesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireManager();
  const edit = uuidSchema.safeParse((await searchParams).edit);
  redirect(`/employees?manageTrades=1${edit.success ? `&editTrade=${edit.data}` : ""}`);
}
