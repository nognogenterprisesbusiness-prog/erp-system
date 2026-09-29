import { uuidSchema } from "@nognog/domain";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EquipmentRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const params = await searchParams;
  const asset = uuidSchema.safeParse(params.asset);
  let kind: "equipment" | "vehicle" = params.type === "vehicle" ? "vehicle" : "equipment";
  if (asset.success) {
    const supabase = await createClient();
    const { data } = await supabase.from("assets").select("asset_kind").eq("id", asset.data).maybeSingle();
    if (data?.asset_kind === "vehicle") kind = "vehicle";
  }
  const next = new URLSearchParams({ type: kind });
  for (const key of ["asset", "project", "site", "status", "q", "page"] as const) {
    const value = params[key];
    if (typeof value === "string") next.set(key, value);
  }
  redirect(`/requests?${next}`);
}
