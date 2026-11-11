import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";

export function RecordViewLink({ href, name }: { href: string; name: string }) {
  return <Button variant="outline" size="sm" asChild><Link href={href} aria-label={`View ${name}`}>View</Link></Button>;
}
