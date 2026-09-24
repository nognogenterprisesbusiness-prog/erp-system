"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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

  return <form action="/reports/daily" className="flex min-w-0 flex-wrap items-center gap-2">
    <input type="hidden" name="q" value={search} />
    <input type="hidden" name="project" value={projectId} />
    <input type="hidden" name="site" value={siteId} />
    <input type="hidden" name="status" value={status} />
    <DateRangePicker startDate={start} endDate={end} onStartChange={setStart} onEndChange={setEnd} startName="from" endName="to" className="w-full sm:w-[292px]" />
    <Button type="submit" variant="outline">Apply dates</Button>
  </form>;
}
