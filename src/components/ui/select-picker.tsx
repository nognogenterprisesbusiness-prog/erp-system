"use client";

import * as Select from "@radix-ui/react-select";
import { useCallback, useContext, useState } from "react";
import { CheckmarkCircle02Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import { FilterBarContext } from "./filter-bar-context";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type SelectPickerProps = {
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

export function SelectPicker({ id, options, label, name, value, defaultValue, onValueChange, placeholder = "Select an option", disabled, required, className }: SelectPickerProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();
  const filterChange = useContext(FilterBarContext);
  const attachTrigger = useCallback((node: HTMLButtonElement | null) => setPortalContainer(node?.closest("dialog") ?? undefined), []);
  return <Select.Root name={name} value={value} defaultValue={defaultValue} onValueChange={(next) => { onValueChange?.(next); if (name) filterChange?.(name, next); }} disabled={disabled} required={required}>
    <Select.Trigger id={id} ref={attachTrigger} aria-label={label} className={cn("inline-flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 outline-none transition-colors focus-visible:border-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-600/20 disabled:cursor-not-allowed disabled:opacity-50", className)}>
      <span className="min-w-0 flex-1 truncate"><Select.Value placeholder={placeholder} /></span>
      <Select.Icon><HugeiconsIcon icon={ArrowDown01Icon} size={16} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal container={portalContainer}>
      <Select.Content position="popper" sideOffset={5} collisionPadding={8} className="z-[100] max-h-[min(18rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 text-slate-800 shadow-xl">
        <Select.Viewport className="max-h-72 overflow-y-auto">
          {options.map((option) => <Select.Item key={option.value} value={option.value} disabled={option.disabled} className="relative flex min-h-9 cursor-pointer select-none items-center rounded-md py-2 pl-3 pr-9 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-cyan-50 data-[highlighted]:text-cyan-900">
            <Select.ItemText>{option.label}</Select.ItemText>
            <Select.ItemIndicator className="absolute right-2 text-cyan-700"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} /></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
