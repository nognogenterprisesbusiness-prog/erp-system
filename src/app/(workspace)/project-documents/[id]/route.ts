import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canPreviewProjectDocument, projectDocumentDownloadName } from "@/lib/project-documents";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!uuidPattern.test(id)) return new Response(null, { status: 404 });

  const supabase = await createClient();
  const { data: document, error: lookupError } = await supabase.from("project_documents")
    .select("file_name,content_type,storage_path")
    .eq("id", id)
    .maybeSingle();
  if (lookupError || !document) return new Response(null, { status: 404 });

  const { data, error } = await supabase.storage.from("erp-project-documents").download(document.storage_path);
  if (error || !data) return new Response(null, { status: 404 });

  const inline = new URL(request.url).searchParams.get("view") === "1" && canPreviewProjectDocument(document.content_type);
  return new Response(data, {
    headers: {
      "Content-Type": document.content_type,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(projectDocumentDownloadName(document.file_name, document.content_type))}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
