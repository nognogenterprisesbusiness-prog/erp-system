import { createClient } from "@/lib/supabase/server";
import { readAttendancePhoto } from "@/lib/media/attendance-evidence";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await createClient();
  const { data } = await client.auth.getClaims();
  if (!data?.claims?.sub) return new Response(null, { status: 401 });
  return readAttendancePhoto(client, (await params).id);
}
