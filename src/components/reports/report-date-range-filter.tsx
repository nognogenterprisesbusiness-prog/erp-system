"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DateRangePicker } from "@/components/ui/date-range-picker";

export function ReportDateRangeFilter({ startDate, endDate, search, projectId, siteId, status }: {
  startDate: string;
  endDate: string;
  search: string;
  projectId: string;
  siteId: string;
  status: string;
}) {
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const router = useRouter();
  function update(nextStart: string, nextEnd: string) {
    setStart(nextStart);
    setEnd(nextEnd);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ q: search, project: projectId, site: siteId, status, from: nextStart, to: nextEnd })) {
      if (value && value !== "all") params.set(key, value);
    }
    router.replace(`/reports/daily?${params}`, { scroll: false });
  }

  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <DateRangePicker startDate={start} endDate={end} onStartChange={setStart} onEndChange={setEnd} onRangeChange={update} className="w-full sm:w-[292px]" />
  </div>;
}
