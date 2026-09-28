import {
  mobileQuerySchema,
  mobileCommandSchema,
  mobileResponseSchemas,
  uuidSchema,
} from "@nognog/domain";
import { z } from "zod";
import type { MobileResource } from "@nognog/domain";
import {
  boundedBody,
  mobileContext,
  MobileError,
  mobileFailure,
  databaseError,
} from "@/lib/mobile/http";
import { readMobileResource } from "@/lib/mobile/queries";
import { executeSiteCommand } from "@/lib/mobile/commands";
import { authorizeMobileCommand } from "@/lib/mobile/authorization";
import { readRecordPhoto } from "@/lib/media/read-record-photo";
import { prepareRecordPhoto, saveRecordPhoto } from "@/lib/media/record-photo";

export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
const success = (data: unknown) =>
  Response.json(
    { ok: true, data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
export async function GET(request: Request, context: Context) {
  try {
    const { path } = await context.params;
    const { client, user } = await mobileContext(request, false);
    if (path.length === 2 && path[0] === "profile" && path[1] === "photo") {
      if (!user.avatar_path) throw new MobileError(404, "Profile photo not found.");
      const photo = await client.storage.from("erp-profile-photos").download(user.avatar_path);
      if (photo.error || !photo.data) throw new MobileError(404, "Profile photo not found.");
      return new Response(photo.data, { headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      } });
    }
    if (
      path.length === 3 &&
      path[0] === "photos" &&
      ["projects", "daily-reports", "materials", "assets"].includes(path[1])
    )
      return readRecordPhoto(client, path[1], path[2]);
    if (path.length !== 1 || !Object.hasOwn(mobileResponseSchemas, path[0]))
      throw new MobileError(404, "This screen is unavailable.");
    const resource = path[0] as MobileResource;
    const query = mobileQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success)
      throw new MobileError(
        400,
        "Review the search, date and selected records.",
      );
    return success(
      mobileResponseSchemas[resource].parse(
        await readMobileResource(client, resource, query.data, user),
      ),
    );
  } catch (error) {
    return mobileFailure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const { path } = await context.params;
    const { client, user } = await mobileContext(request, true);
    if (path.length === 2 && path[0] === "profile" && path[1] === "photo") {
      if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
        throw new MobileError(415, "Send a photo upload.");
      const bytes = await boundedBody(request, 3_100_000);
      const form = await new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
        body: new Uint8Array(bytes).buffer,
      }).formData();
      let photo: Buffer | undefined;
      try {
        photo = await prepareRecordPhoto(form.get("photo"));
      } catch {
        throw new MobileError(422, "Choose a PNG or JPEG photo under 3 MB.");
      }
      if (!photo) throw new MobileError(422, "Choose a photo first.");
      const avatarPath = `profiles/${user.id}/avatar.webp`;
      const uploaded = await client.storage.from("erp-profile-photos").upload(avatarPath, photo, {
        contentType: "image/webp", upsert: true, cacheControl: "0",
      });
      if (uploaded.error) throw new MobileError(503, "Profile photo could not be saved. Please retry.");
      const attached = await client.from("profiles").update({ avatar_path: avatarPath })
        .eq("id", user.id).select("avatar_path").single();
      if (attached.error) databaseError(attached.error);
      return success({ avatar_path: attached.data.avatar_path });
    }
    if (path.length === 1 && path[0] === "profile") {
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        throw new MobileError(415, "Send a JSON request.");
      const bytes = await boundedBody(request, 1024);
      let input: unknown;
      try {
        input = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new MobileError(400, "Request content is invalid.");
      }
      const parsed = z.object({ fullName: z.string().trim().min(2).max(160) }).safeParse(input);
      if (!parsed.success)
        throw new MobileError(422, "Enter a name between 2 and 160 characters.");
      const updated = await client
        .from("profiles")
        .update({ full_name: parsed.data.fullName })
        .eq("id", user.id)
        .select("full_name")
        .single();
      if (updated.error) databaseError(updated.error);
      return success({ full_name: updated.data.full_name });
    }
    if (
      path.length === 3 &&
      path[0] === "photos" &&
      path[1] === "daily-reports"
    ) {
      const id = uuidSchema.safeParse(path[2]);
      if (!id.success) throw new MobileError(400, "Invalid report.");
      const report = await client
        .from("daily_reports")
        .select("id,status,prepared_by")
        .eq("id", id.data)
        .maybeSingle();
      if (
        report.error ||
        !report.data ||
        report.data.status !== "draft" ||
        report.data.prepared_by !== user.id
      )
        throw new MobileError(
          403,
          "Only your editable draft may receive a photo.",
        );
      const bytes = await boundedBody(request, 3_100_000);
      const form = await new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
        body: new Uint8Array(bytes).buffer,
      }).formData();
      let photo: Buffer | undefined;
      try {
        photo = await prepareRecordPhoto(form.get("photo"));
      } catch {
        throw new MobileError(
          422,
          "Choose a valid PNG or JPEG under 3 MB. Your report remains editable.",
        );
      }
      if (!photo) throw new MobileError(422, "Choose a photo first.");
      try {
        await saveRecordPhoto("daily-reports", id.data, photo, client);
      } catch {
        throw new MobileError(
          503,
          "The photo could not be attached. Your report remains editable; retry the upload.",
        );
      }
      return success({ id: id.data, message: "Photo attached." });
    }
    if (path.length !== 1 || path[0] !== "commands")
      throw new MobileError(404, "This action is unavailable.");
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new MobileError(415, "Send a JSON request.");
    const bytes = await boundedBody(request, 256 * 1024);
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new MobileError(400, "Request content is invalid.");
    }
    const command = mobileCommandSchema.safeParse(body);
    if (!command.success)
      throw new MobileError(
        422,
        "Review the highlighted fields.",
        command.error.flatten().fieldErrors,
      );
    await authorizeMobileCommand(client, command.data);
    return success(await executeSiteCommand(client, command.data));
  } catch (error) {
    return mobileFailure(error);
  }
}
