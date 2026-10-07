"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { prepareRecordPhoto } from "@/lib/media/record-photo";
import { createClient } from "@/lib/supabase/server";

export type ProfileActionState = { ok: boolean; message: string };
const profileSchema = z.object({ fullName: z.string().trim().min(2).max(160), phone: z.string().trim().max(40), email: z.email().max(320) });

export async function updateMyProfileAction(_: ProfileActionState, form: FormData): Promise<ProfileActionState> {
  const actor = await requireUser();
  const parsed = profileSchema.safeParse({ fullName: form.get("fullName"), phone: form.get("phone"), email: form.get("email") });
  if (!parsed.success) return { ok: false, message: "Enter a valid name, phone number, and email address." };
  let photo: Buffer | undefined;
  try { photo = await prepareRecordPhoto(form.get("photo")); }
  catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : "Invalid profile picture." }; }
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName, phone: parsed.data.phone || null }).eq("id", actor.userId);
  if (error) return { ok: false, message: "Profile details could not be updated." };
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  if (photo) {
    const path = `profiles/${actor.userId}/avatar.webp`;
    const { error: uploadError } = await supabase.storage.from("erp-profile-photos").upload(path, photo, { contentType: "image/webp", upsert: true, cacheControl: "0" });
    if (uploadError) return { ok: false, message: "Contact details saved, but the profile picture could not be uploaded." };
    const { error: attachError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", actor.userId);
    if (attachError) return { ok: false, message: "Contact details saved, but the profile picture could not be attached." };
  }
  if (parsed.data.email.toLowerCase() !== actor.profile.email.toLowerCase()) {
    const { error: emailError } = await supabase.auth.updateUser({ email: parsed.data.email });
    if (emailError) return { ok: false, message: "Profile saved, but the email-change request could not be sent." };
    return { ok: true, message: "Profile saved. Confirm the email change using the link sent by your authentication provider." };
  }
  return { ok: true, message: "Profile updated." };
}
