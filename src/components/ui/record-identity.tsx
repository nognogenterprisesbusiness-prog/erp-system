import type { ReactNode } from "react";

export function RecordIdentity({ name, code }: { name: ReactNode; code?: ReactNode }) {
  return <span className="block min-w-0"><span className="block break-words font-medium text-slate-800">{name}</span>{code && <span className="mt-1 block break-words text-xs font-normal text-slate-500">{code}</span>}</span>;
}
