import { requireUser } from "@/lib/auth";
import { listQrCodes, qrEntityLabels } from "@/lib/data/qr-codes";
import { streamCsvAttachment } from "@/lib/export/csv";
import type { QrEntityType } from "@/types/database";

export async function GET(request: Request) {
  if (!(await requireUser()).canManage) return new Response("Forbidden", { status: 403 });
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const entityType = type && Object.hasOwn(qrEntityLabels, type) ? type as QrEntityType : undefined;
  async function* batches() {
    for (let page = 1; ; page++) {
      const result = await listQrCodes(page, entityType, params.get("q") ?? "", 500);
      yield result.codes.map(code => [code.public_identifier, qrEntityLabels[code.entity_type], code.generated_at, code.status]);
      if (page * result.pageSize >= result.count || !result.codes.length) return;
    }
  }
  return streamCsvAttachment("nognog-qr-registry.csv", ["Identifier", "Record type", "Generated", "Status"], batches());
}
