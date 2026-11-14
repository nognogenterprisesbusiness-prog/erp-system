import { redirect } from "next/navigation";
import { requireManagerPage } from "@/lib/auth";

// Preserve old bookmarks without maintaining a separate driver-management screen.
export default async function DriversPage() {
  await requireManagerPage();
  redirect("/users");
}
