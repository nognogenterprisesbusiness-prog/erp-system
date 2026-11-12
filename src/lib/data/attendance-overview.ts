import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const resultSchema = z.object({ count: z.number(), rows: z.array(z.object({ id: z.string(), position_title: z.string(), project_id: z.string(), employee: z.object({ code: z.string(), first_name: z.string(), last_name: z.string() }), project: z.object({ code: z.string(), name: z.string() }), site: z.object({ name: z.string() }), attendance: z.object({ attendance_status: z.enum(["present", "absent"]), hours_worked: z.coerce.number(), rate_snapshot: z.coerce.number().nullable(), cost_total: z.coerce.number() }).nullable() })) });
export async function getAttendanceOverview(date: string, projectId: string | null, page: number, query = "", status = "all") {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_attendance_overview", { p_date: date, p_project_id: projectId, p_page: page, p_query: query, p_status: status });
  if (error) throw new Error("Unable to search attendance. Check that the staff-read database update is installed.");
  const result = resultSchema.parse(data);
  return { ...result, rows: result.rows.map(row => ({ ...row, attendance: row.attendance ?? undefined })), page, pageCount: Math.max(1, Math.ceil(result.count / 25)) };
}
