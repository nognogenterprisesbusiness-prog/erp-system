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

export function streamCsvAttachment(filename: string, headers: string[], batches: AsyncIterable<Array<Array<string | number>>>): Response {
  const encoder = new TextEncoder();
  const iterator = batches[Symbol.asyncIterator]();
  let first = true;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (first) { first = false; controller.enqueue(encoder.encode(encodeCsv(headers, []))); return; }
        const next = await iterator.next();
        if (next.done) { controller.close(); return; }
        const chunk = next.value.map(row => encodeCsv([], [row]).slice(1)).join("");
        controller.enqueue(encoder.encode(chunk));
      } catch (error) { controller.error(error); }
    },
    async cancel() { await iterator.return?.(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
