import { MyProfileForm } from "@/components/users/my-profile-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export default async function ProfilePage() {
  const { profile } = await requireUser();
  return <><PageHeader eyebrow="My account" title="Profile" description="Keep your picture and contact details current." /><MyProfileForm fullName={profile.full_name} phone={profile.phone} email={profile.email} avatarUrl={profile.avatar_path ? "/profile/avatar" : undefined} /></>;
}
