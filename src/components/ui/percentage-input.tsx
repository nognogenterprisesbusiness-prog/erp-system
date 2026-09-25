"use client";

import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<"input">, "type" | "inputMode" | "min" | "max" | "step"> & {
  decimals?: 0 | 2;
};

export function PercentageInput({ decimals = 0, onInput, ...props }: Props) {
  return <input {...props} type="text" inputMode={decimals ? "decimal" : "numeric"} pattern={decimals ? "(?:100(?:\\.0{1,2})?|[0-9]{1,2}(?:\\.[0-9]{1,2})?)" : "(?:100|[0-9]{1,2})"} maxLength={decimals ? 6 : 3} onInput={(event) => {
    const input = event.currentTarget;
    const raw = input.value.replace(decimals ? /[^\d.]/g : /\D/g, "");
    const [whole, ...parts] = raw.split(".");
    const next = decimals && parts.length ? `${whole.slice(0, 3)}.${parts.join("").slice(0, 2)}` : whole.slice(0, 3);
    input.value = Number(next) > 100 ? "100" : next;
    onInput?.(event);
  }} />;
}
