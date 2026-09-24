export default function WorkspaceLoading() {
  return <div className="animate-pulse" aria-busy="true" aria-label="Loading workspace">
    <div className="h-4 w-36 rounded bg-slate-200" />
    <div className="mt-3 h-9 w-64 rounded bg-slate-200" />
    <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 rounded-2xl border border-slate-200 bg-white" />)}</div>
    <div className="mt-5 h-80 rounded-2xl border border-slate-200 bg-white" />
  </div>;
}
