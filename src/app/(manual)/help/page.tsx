import { LegacyManualRedirect } from "@/components/help/legacy-manual-redirect";
import { requireUser } from "@/lib/auth";
import { getManualGuides } from "@/lib/help/manual";

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const query = (typeof params.q === "string" ? params.q : "").slice(0, 100);
  return <LegacyManualRedirect allowedTopics={getManualGuides(user.roles).map((guide) => guide.id)} query={query} />;
}
