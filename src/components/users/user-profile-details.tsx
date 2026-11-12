import { AccountAvatar } from "@/components/ui/account-avatar";

export type UserProfileDetailsProps = { name: string; email: string; phone: string | null; roles: string; status: string; avatarUrl?: string; truck?: string };

export function UserProfileDetails({ name, email, phone, roles, status, avatarUrl, truck }: UserProfileDetailsProps) {
  return <>
    <AccountAvatar name={name} photo={avatarUrl} className="size-12 bg-cyan-50 text-sm font-semibold text-cyan-700" />
    <dl className="mt-5 divide-y divide-slate-100">{[["Email", email], ["Phone", phone || "Not recorded"], ["Role", roles || "No role assigned"], ["Access", status], ...(truck !== undefined ? [["Assigned truck", truck]] : [])].map(([label, value]) => <div key={label} className="grid gap-2 py-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)]"><dt className="text-slate-500">{label}</dt><dd className="min-w-0 break-words font-medium text-slate-800">{value}</dd></div>)}</dl>
  </>;
}
