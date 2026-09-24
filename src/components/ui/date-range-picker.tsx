"use client";

import { DatePicker } from "@/components/ui/date-picker";

export function DateRangePicker({ startDate, endDate, onStartChange, onEndChange, startName, endName, startLabel = "Start date", endLabel = "End date", groupLabel = "Date range", className = "" }: {
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  startName?: string;
  endName?: string;
  startLabel?: string;
  endLabel?: string;
  groupLabel?: string;
  className?: string;
}) {
  const changeStart = (value: string) => {
    onStartChange(value);
    if (value && endDate && value > endDate) onEndChange("");
  };
  const changeEnd = (value: string) => {
    onEndChange(value);
    if (value && startDate && value < startDate) onStartChange("");
  };

  return <div className={`grid min-w-0 grid-cols-2 gap-2 ${className}`} role="group" aria-label={groupLabel}>
    <DatePicker name={startName} label={startLabel} placeholder={startLabel} value={startDate} onValueChange={changeStart} />
    <DatePicker name={endName} label={endLabel} placeholder={endLabel} value={endDate} onValueChange={changeEnd} popoverAlign="end" />
  </div>;
}
