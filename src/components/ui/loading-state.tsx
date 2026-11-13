import { cn } from "@/lib/utils";

export function LoadingSpinner({ label = "Loading", className }: { label?: string; className?: string }) {
  return <span role="status" aria-label={label} className={cn("inline-flex items-center justify-center p-2", className)}><span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-600 motion-reduce:animate-pulse" /></span>;
}

export function FieldsSkeleton({ fields = 6, label = "Loading form" }: { fields?: number; label?: string }) {
  return <div role="status" aria-label={label} className="grid gap-5 sm:grid-cols-2">{Array.from({ length: fields }, (_, index) => <div key={index} aria-hidden="true" className="space-y-2"><div className="h-3 w-24 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" /><div className="h-11 w-full animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" /></div>)}</div>;
}
