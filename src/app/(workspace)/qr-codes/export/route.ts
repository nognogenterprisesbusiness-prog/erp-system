import { requireUser } from "@/lib/auth";
import { listQrCodes, qrEntityLabels } from "@/lib/data/qr-codes";
import { csvAttachment } from "@/lib/export/csv";
import type { QrEntityType } from "@/types/database";

export async function GET(request: Request) {
  if (!(await requireUser()).canManage) return new Response("Forbidden", { status: 403 });
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const entityType = type && Object.hasOwn(qrEntityLabels, type) ? type as QrEntityType : undefined;
  const rows: Array<Array<string | number>> = [];
  for (let page = 1; ; page++) {
    const result = await listQrCodes(page, entityType, params.get("q") ?? "", 500);
    if (result.count > 20000 || rows.length + result.codes.length > 20000) return new Response("Export is too large; narrow the filters.", { status: 422 });
    rows.push(...result.codes.map((code) => [code.public_identifier, qrEntityLabels[code.entity_type], code.generated_at, code.status]));
    if (page * result.pageSize >= result.count) break;
    if (page >= 40) return new Response("Export is too large; narrow the filters.", { status: 422 });
  }
  return csvAttachment("nognog-qr-registry.csv", ["Identifier", "Record type", "Generated", "Status"], rows);
}
