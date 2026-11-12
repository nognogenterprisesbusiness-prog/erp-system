import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";

// Preserve old bookmarks without maintaining a separate driver-management screen.
export default async function DriversPage() {
  await requireManager();
  redirect("/users");
}
