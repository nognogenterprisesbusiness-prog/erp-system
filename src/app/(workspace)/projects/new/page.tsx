import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function NewProjectPage() {
  const user = await requireUser();
  if (!user.canManage) redirect("/projects");
  redirect("/projects?create=1");
}
