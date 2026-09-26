export function encodeCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const cell = (value: string | number): string => {
    let text = String(value).replace(/[\r\n\t]+/g, " ");
    if (typeof value === "string" && /^\s*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${[headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")}`;
}

export function csvAttachment(filename: string, headers: string[], rows: Array<Array<string | number>>): Response {
  return new Response(encodeCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
