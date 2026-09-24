import type { ReactNode } from "react";

export function RegistryToolbar({ search, actions, className = "" }: { search: ReactNode; actions?: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
    <div className="min-w-[210px] max-w-sm flex-1">{search}</div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>;
}
