import { MyProfileForm } from "@/components/users/my-profile-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export default async function ProfilePage() {
  const { profile } = await requireUser();
  return <><PageHeader eyebrow="My account" title="Settings" description="Update your profile photo, name, phone and email. Use the header theme control to change appearance." /><MyProfileForm fullName={profile.full_name} phone={profile.phone} email={profile.email} avatarUrl={profile.avatar_path ? "/profile/avatar" : undefined} /></>;
}
