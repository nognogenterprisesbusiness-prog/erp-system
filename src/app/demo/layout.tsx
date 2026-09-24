import { notFound } from "next/navigation";

import { demoIsEnabled } from "@/lib/app-mode";

export const dynamic = "force-dynamic";

export default function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!demoIsEnabled()) notFound();
  return <div className="min-h-svh bg-[#f5f7fa] text-[#07152d]">{children}</div>;
}
