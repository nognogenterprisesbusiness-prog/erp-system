import { mobileCompatibility } from "@/lib/mobile/compatibility";

export const runtime = "nodejs";
export function GET() {
  // Public release metadata contains no account or company data.
  return Response.json({ ok: true, data: mobileCompatibility() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
