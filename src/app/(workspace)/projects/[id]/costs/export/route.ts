import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import writeXlsxFile from "write-excel-file/node";
import { uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { projectSummaryDisclaimer, projectSummaryLines } from "@/lib/export/project-summary";
import { fitPdfText } from "@/lib/export/pdf-text";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const money = (value: number) => new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await requireUser();
  if (!user.canViewLaborRates) return new Response("Financial export access is required.", { status: 403 });
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) return new Response("Invalid project ID.", { status: 400 });
  const format = new URL(request.url).searchParams.get("format");
  if (format !== "pdf" && format !== "xlsx") return new Response("Unsupported export format.", { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_profitability", { p_project_id: id });
  if (error || !data?.[0]) return new Response("Project summary is unavailable.", { status: 404 });
  const summary = data[0];
  const lines = projectSummaryLines(summary);
  const filename = `project-summary-${id}-${new Date().toISOString().slice(0, 10)}.${format}`;
  const headers = {
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (format === "xlsx") {
    const sheet = [
      ["Project management summary", `${summary.project_code} - ${summary.project_name}`],
      ["Project ID", id],
      ["Generated at (UTC)", new Date().toISOString()],
      [],
      ["Metric", "Value (PHP unless %)"],
      ...lines.map((line) => [line.label, line.amount]),
      ["Estimated gross margin (%)", summary.estimated_gross_margin_percent ?? "N/A"],
      [],
      [projectSummaryDisclaimer],
    ];
    const buffer = await writeXlsxFile(sheet).toBuffer();
    return new Response(new Uint8Array(buffer), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
  }

  const document = await PDFDocument.create();
  document.setTitle(`Project management summary - ${summary.project_code}`);
  const page = document.addPage([595.28, 841.89]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  page.drawText("PROJECT MANAGEMENT SUMMARY", { x: 48, y: 786, size: 16, font: bold, color: rgb(0.06, 0.17, 0.28) });
  page.drawText(fitPdfText(`${summary.project_code} - ${summary.project_name}`, regular, 10, 499), { x: 48, y: 758, size: 10, font: regular });
  page.drawText(`Project ID: ${id}`, { x: 48, y: 740, size: 9, font: regular });
  page.drawText(`Generated: ${new Date().toISOString().slice(0, 16)} UTC`, { x: 48, y: 723, size: 9, font: regular });
  let y = 686;
  for (const line of lines) {
    page.drawText(line.label, { x: 48, y, size: 10, font: line.label === "Estimated gross project profit" ? bold : regular });
    const amount = `PHP ${money(line.amount)}`;
    page.drawText(amount, { x: 547 - bold.widthOfTextAtSize(amount, 10), y, size: 10, font: bold });
    y -= 29;
  }
  page.drawText("Estimated gross margin", { x: 48, y, size: 10, font: regular });
  const margin = summary.estimated_gross_margin_percent === null ? "N/A" : `${summary.estimated_gross_margin_percent}%`;
  page.drawText(margin, { x: 547 - bold.widthOfTextAtSize(margin, 10), y, size: 10, font: bold });
  page.drawText("Provisional report: contract value less posted costs.", { x: 48, y: 266, size: 9, font: regular });
  page.drawText("Not recognized-revenue, cash profit or a tax statement.", { x: 48, y: 252, size: 9, font: regular });
  const bytes = await document.save();
  return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/pdf" } });
}
