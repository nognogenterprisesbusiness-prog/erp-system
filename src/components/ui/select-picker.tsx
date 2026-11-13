"use client";

import * as Select from "@radix-ui/react-select";
import { useCallback, useContext, useState, type AriaAttributes } from "react";
import { CheckmarkCircle02Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { SearchableSelectPicker } from "./searchable-select-picker";
import { cn } from "@/lib/utils";
import { FilterBarContext } from "./filter-bar-context";

export type SelectOption = { value: string; label: string; secondary?: string; disabled?: boolean };

export type SelectPickerProps = Pick<AriaAttributes, "aria-describedby" | "aria-invalid" | "aria-required"> & {
  searchable?: boolean;
  selectedOption?: SelectOption;
  onSearchChange?: (query: string) => void;
  loading?: boolean;
  resultCount?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  id?: string;
  options: readonly SelectOption[];
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

function StandardSelectPicker({ id, options, label, name, value, defaultValue, onValueChange, placeholder = `Choose ${label.toLowerCase()}`, disabled, required, className, "aria-describedby": describedBy, "aria-invalid": invalid, "aria-required": ariaRequired }: SelectPickerProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();
  const filterChange = useContext(FilterBarContext);
  const attachTrigger = useCallback((node: HTMLButtonElement | null) => setPortalContainer(node?.closest("dialog") ?? undefined), []);
  return <Select.Root name={name} value={value} defaultValue={defaultValue} onValueChange={(next) => { onValueChange?.(next); if (name) filterChange?.(name, next); }} disabled={disabled || options.length === 0} required={required}>
    <Select.Trigger aria-describedby={describedBy} aria-invalid={invalid} aria-required={ariaRequired ?? required} id={id} ref={attachTrigger} aria-label={label} className={cn("inline-flex min-h-11 h-auto w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-800 outline-none transition-colors focus-visible:border-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-600/20 disabled:cursor-not-allowed disabled:opacity-50", className)}>
      <span className="min-w-0 flex-1 whitespace-normal break-words leading-5"><Select.Value placeholder={placeholder} /></span>
      <Select.Icon className="shrink-0"><HugeiconsIcon icon={ArrowDown01Icon} size={16} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal container={portalContainer}>
      <Select.Content position="popper" sideOffset={5} collisionPadding={8} className="z-[100] max-h-[min(18rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-[min(20rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 text-slate-800 shadow-xl">
        <Select.Viewport data-erp-select-viewport="" className="max-h-[min(18rem,calc(var(--radix-select-content-available-height)-0.75rem))] overflow-y-auto overscroll-contain">
          {options.map((option) => <Select.Item key={option.value} value={option.value} disabled={option.disabled} className="relative flex min-h-9 cursor-pointer select-none items-center rounded-md py-2 pl-3 pr-9 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-cyan-50 data-[highlighted]:text-cyan-900">
            <span className="min-w-0"><Select.ItemText className="whitespace-normal break-words">{option.label}</Select.ItemText>{option.secondary && <span className="mt-0.5 block text-xs text-slate-500">{option.secondary}</span>}</span>
            <Select.ItemIndicator className="absolute right-2 text-cyan-700"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} /></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}

export function SelectPicker(props: SelectPickerProps) {
  return (props.searchable ?? props.options.length >= 8) ? <SearchableSelectPicker {...props} /> : <StandardSelectPicker {...props} />;
}
