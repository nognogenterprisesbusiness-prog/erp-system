"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { getDemoDatabase, updateDemoProfile } from "@/lib/demo/database";
import type { DemoData } from "@/lib/demo/schema";
import { demoPhotoFromFile } from "@/lib/media/demo-photo";
import { convertImageToWebp } from "@/lib/media/webp";

type Props = {
  user: DemoData["users"][number];
  onProfileSaved: () => Promise<void>;
  savedAt: string | null;
  busy: boolean;
  canExitToLive: boolean;
  onSave: () => void;
  onRestore: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
};

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-slate-100 px-5 py-6 last:border-0 sm:px-7" aria-label={title}>
    <h2 className="text-sm font-semibold text-[#07152d]">{title}</h2>
    <div className="mt-4">{children}</div>
  </section>;
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-sm"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-800">{value}</span></div>;
}

export function DemoSettings({ user, onProfileSaved, savedAt, busy, canExitToLive, onSave, onRestore, onExport, onImport, onReset }: Props) {
  const importInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageMessage, setImageMessage] = useState("");
  const [imageError, setImageError] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profileBusy) return;
    setProfileBusy(true); setProfileError(""); setProfileMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const file = form.get("photo");
      const photo = file instanceof File && file.size ? await demoPhotoFromFile(file, 500) : undefined;
      await updateDemoProfile(getDemoDatabase(), { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), phone: String(form.get("phone") ?? ""), photo });
      await onProfileSaved();
      setProfileMessage("Profile saved.");
    } catch (cause) { setProfileError(cause instanceof Error ? cause.message : "Unable to save profile."); }
    finally { setProfileBusy(false); }
  }

  async function convert(file: File) {
    setImageBusy(true);
    setImageError("");
    setImageMessage("");
    try {
      const output = await convertImageToWebp(file);
      const url = URL.createObjectURL(output);
      const link = document.createElement("a");
      link.href = url;
      link.download = output.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setImageMessage(`${(file.size / 1_000_000).toFixed(2)} MB PNG/JPEG → ${(output.size / 1_000_000).toFixed(2)} MB WebP downloaded.`);
    } catch (cause) {
      setImageError(cause instanceof Error ? cause.message : "Image conversion failed.");
    } finally {
      setImageBusy(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  return <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
    <SettingsSection title="My profile">
      <form key={user.id} onSubmit={(event) => void saveProfile(event)} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><RecordPhotoInput label="Profile picture" currentPhoto={user.photo} /></div>
        <label className="grid gap-1.5 text-sm font-medium text-slate-600">Full name<input key={user.name} name="name" defaultValue={user.name} minLength={2} maxLength={160} required className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800" /></label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-600">Phone number<input key={user.phone ?? ""} name="phone" defaultValue={user.phone ?? ""} maxLength={40} autoComplete="tel" className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800" /></label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-600 sm:col-span-2">Email address<input key={user.email ?? ""} name="email" type="email" defaultValue={user.email ?? ""} maxLength={320} required autoComplete="email" className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-800" /></label>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">{profileError ? <p role="alert" className="text-sm text-red-700">{profileError}</p> : profileMessage ? <p role="status" className="text-sm text-emerald-700">{profileMessage}</p> : <span />}<Button type="submit" disabled={profileBusy}>{profileBusy ? "Saving…" : "Save profile"}</Button></div>
      </form>
    </SettingsSection>
    <SettingsSection title="Environment">
      <SettingRow label="Current mode" value="Local Demo" />
      <SettingRow label="Storage" value="Local device" />
      <SettingRow label="Database" value="nognog_erp_demo" />
    </SettingsSection>
    <SettingsSection title="Demo data">
      <p className="mb-4 text-sm text-slate-500">{savedAt ? `Snapshot saved ${new Date(savedAt).toLocaleString()}.` : "No local snapshot saved yet."}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="text-sm" onClick={onSave} disabled={busy}>Save demo snapshot</Button>
        <Button size="sm" className="text-sm" variant="outline" onClick={onRestore} disabled={busy || !savedAt}>Restore snapshot</Button>
        <Button size="sm" className="text-sm" variant="outline" onClick={onExport} disabled={busy}>Export demo data</Button>
        <Button size="sm" className="text-sm" variant="outline" onClick={() => importInput.current?.click()} disabled={busy}>Import demo data</Button>
        <Button size="sm" className="text-sm" variant="outline" onClick={onReset} disabled={busy}>Reset demo data</Button>
      </div>
      <input ref={importInput} type="file" accept="application/json,.json" aria-label="Import demo JSON file" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); if (importInput.current) importInput.current.value = ""; }} />
      <p className="mt-4 text-sm leading-5 text-slate-500">Snapshots, exports, imports, and resets affect only this browser’s demo database. A saved snapshot remains available after reset.</p>
    </SettingsSection>
    <SettingsSection title="Image optimization">
      <p className="max-w-xl text-sm leading-5 text-slate-500">Convert a PNG or JPEG to a smaller WebP file on this device. The converted file downloads; no image is sent to a server or added to the demo database.</p>
      <Button className="mt-3 text-sm" size="sm" variant="outline" onClick={() => imageInput.current?.click()} disabled={imageBusy}>{imageBusy ? "Converting…" : "Convert PNG/JPEG to WebP"}</Button>
      <input ref={imageInput} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" aria-label="Choose image to convert" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void convert(file); }} />
      {imageMessage ? <p className="mt-3 text-sm text-emerald-700" role="status">{imageMessage}</p> : null}
      {imageError ? <p className="mt-3 text-sm text-red-700" role="alert">{imageError}</p> : null}
    </SettingsSection>
    <SettingsSection title="Access">
      {canExitToLive ? <Button asChild size="sm" className="text-sm" variant="outline"><Link href="/">Exit demo mode</Link></Button> : <Button size="sm" className="text-sm" variant="outline" disabled>Exit demo mode</Button>}
      {!canExitToLive ? <p className="mt-2 text-sm text-slate-500">This deployment runs only Local Demo. Open the separately configured live application to use production data.</p> : null}
    </SettingsSection>
  </div>;
}
