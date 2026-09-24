export function DemoBanner({ controls }: { controls: React.ReactNode }) {
  return (
    <div className="flex h-11 items-center justify-between gap-3 bg-[#073b54] px-3 text-xs font-medium text-white sm:px-5" role="status">
      <div className="flex min-w-0 items-center gap-2.5"><span className="shrink-0 rounded bg-cyan-300 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#073b54]">DEMO</span></div>
      <div className="flex shrink-0 items-center gap-2"><span className="hidden text-cyan-100 md:inline">Account</span>{controls}</div>
    </div>
  );
}
