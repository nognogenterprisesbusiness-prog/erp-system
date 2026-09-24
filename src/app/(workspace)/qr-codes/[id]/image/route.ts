import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { getQrCode } from "@/lib/data/qr-codes";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser()).canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const code = await getQrCode(id);
  if (code.status !== "active") return NextResponse.json({ error: "QR code is inactive" }, { status: 410 });
  const format = request.nextUrl.searchParams.get("format") === "png" ? "png" : "svg";
  const download = request.nextUrl.searchParams.get("download") === "1";
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${code.public_identifier}.${format}"` };
  if (format === "svg") {
    const svg = await QRCode.toString(code.public_identifier, { type: "svg", errorCorrectionLevel: "M", margin: 2, width: 512 });
    return new NextResponse(svg, { headers: { ...headers, "Content-Type": "image/svg+xml", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  }
  const png = await QRCode.toBuffer(code.public_identifier, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 512 });
  return new NextResponse(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
}
