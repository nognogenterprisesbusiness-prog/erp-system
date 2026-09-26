import { redirect } from "next/navigation";
import { uuidSchema } from "@nognog/domain";

export default async function NewDailyReportPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const parsed = uuidSchema.safeParse(project);
  redirect(`/reports/daily?create=1${parsed.success ? `&project=${parsed.data}` : ""}`);
}
