import { IntentLink as Link } from "@/components/layout/intent-link";

export default function ManualNotFound() {
  return <main id="manual-content" className="px-6 py-12"><h1 className="text-2xl font-semibold text-slate-900">Guide unavailable</h1><p className="mt-3 max-w-xl leading-7 text-slate-600">This topic does not exist or is not available to your role. Choose a guide from the navigation.</p><Link href="/manual/start" className="mt-5 inline-block text-cyan-800 underline underline-offset-4">Return to Quick start</Link></main>;
}
