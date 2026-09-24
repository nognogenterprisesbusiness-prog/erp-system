import { redirect } from "next/navigation";
import { MaterialRequestForm } from "@/components/requests/material-request-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getMaterialRequestChoices } from "@/lib/data/material-requests";

export default async function NewMaterialRequestPage() {
  const user = await requireUser();
  if (!user.canManage && !user.roles.some((role) => ["project_manager", "engineer", "foreman"].includes(role))) redirect("/requests");
  const choices = await getMaterialRequestChoices();
  return <><PageHeader title="New material request" description="Request materials for an assigned project and site. A manager reviews quantities before stock is released." />
    <div className="mt-7 max-w-4xl"><MaterialRequestForm choices={choices} /></div></>;
}
