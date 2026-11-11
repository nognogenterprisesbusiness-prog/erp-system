"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { groupMoney, moneyCaret, ungroupMoney } from "@/lib/ui/money-input";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type"> & {
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (raw: string) => void;
};

/** Display grouping is local; FormData and controlled calculations receive plain decimals. */
export function MoneyInput({ value, defaultValue = "", onValueChange, name, disabled, maxLength, className, ...props }: Props) {
  const [draft, setDraft] = useState(String(defaultValue));
  const raw = ungroupMoney(String(value ?? draft));
  const display = groupMoney(raw);
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => { if (value === undefined) setDraft(String(defaultValue)); };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue, value]);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.setCustomValidity(maxLength && raw.length > maxLength ? `Enter no more than ${maxLength} characters.` : "");
    if (selection.current) {
      element.setSelectionRange(moneyCaret(display, selection.current.start), moneyCaret(display, selection.current.end));
      selection.current = null;
    }
  });
  return <>
    <input {...props} ref={input} type="text" inputMode="decimal" disabled={disabled} value={display}
      pattern="[0-9,]+([.][0-9]{1,2})?" title="Enter an amount with up to two decimal places."
      className={cn("tabular-nums", className)}
      onChange={event => {
        const element = event.currentTarget;
        selection.current = {
          start: ungroupMoney(element.value.slice(0, element.selectionStart ?? element.value.length)).length,
          end: ungroupMoney(element.value.slice(0, element.selectionEnd ?? element.value.length)).length,
        };
        const next = ungroupMoney(element.value);
        setDraft(next);
        onValueChange?.(next);
      }} />
    {name && <input type="hidden" name={name} value={raw} disabled={disabled} />}
  </>;
}
