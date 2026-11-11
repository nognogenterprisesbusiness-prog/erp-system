import { displayStatus } from "@/lib/ui/display";
import { Badge } from "@/components/ui/badge";
import type { AssetStatus } from "@/types/database";
export function AssetStatusBadge({ status }: { status: AssetStatus }) { const variant = status === "available" ? "active" : status === "assigned" || status === "in_use" ? "info" : status === "under_maintenance" ? "review" : "neutral"; return <Badge variant={variant}>{displayStatus(status)}</Badge>; }
