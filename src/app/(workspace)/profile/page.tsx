import { MyProfileForm } from "@/components/users/my-profile-form";
import { ThemeSettings } from "@/components/layout/theme-toggle";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export default async function ProfilePage() {
  const { profile } = await requireUser();
  return <div className="mx-auto max-w-3xl space-y-6"><PageHeader eyebrow="My account" title="My profile" description="Manage your account details and appearance." /><section aria-labelledby="profile-settings-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 id="profile-settings-heading" className="text-sm font-semibold text-slate-900">Personal details</h2><MyProfileForm fullName={profile.full_name} phone={profile.phone} email={profile.email} avatarUrl={profile.avatar_path ? `/profile/avatar?v=${encodeURIComponent(profile.updated_at)}` : undefined} /></section><section aria-labelledby="appearance-settings-heading" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 id="appearance-settings-heading" className="text-sm font-semibold text-slate-900">Appearance</h2><p className="mt-2 text-sm leading-6 text-slate-600">Use the button to cycle through Light, Blue dark and Charcoal on this device.</p><ThemeSettings /></section></div>;
}
