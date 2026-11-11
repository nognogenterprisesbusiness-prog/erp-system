import { cn } from "@/lib/utils";
import { withFieldPlaceholder } from "./field-placeholder";
import { Children, cloneElement, isValidElement, type AriaAttributes, type ReactNode } from "react";

export const fieldControlClass = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10 disabled:bg-slate-50 disabled:text-slate-400";

export function FormField({ label, htmlFor, hint, error, className, children }: { label: string; htmlFor: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  const descriptionId = error ? `${htmlFor}-error` : hint ? `${htmlFor}-help` : undefined;
  function describe(nodes: ReactNode): ReactNode {
    return Children.map(nodes, child => {
      if (!isValidElement<AriaAttributes & { id?: string; type?: string; label?: string; children?: ReactNode; required?: boolean }>(child)) return child;
      if (child.props.type === "hidden") return child;
      const control = ["input", "textarea", "select"].includes(String(child.type)) || child.props.id === htmlFor || (typeof child.type !== "string" && !!child.props.label);
      if (control) return cloneElement(child, { id: child.props.id ?? htmlFor, "aria-invalid": error ? true : child.props["aria-invalid"], "aria-required": child.props.required || undefined, "aria-describedby": [child.props["aria-describedby"], descriptionId].filter(Boolean).join(" ") || undefined });
      return typeof child.type === "string" && child.props.children ? cloneElement(child, { children: describe(child.props.children) }) : child;
    });
  }
  return <div className={cn("grid min-w-0 content-start gap-2 text-sm font-medium text-slate-700", className)}><label htmlFor={htmlFor}>{label}</label>{describe(withFieldPlaceholder(children, label))}{hint && !error && <span id={descriptionId} className="block text-xs font-normal leading-5 text-slate-500">{hint}</span>}{error && <span id={descriptionId} role="alert" className="block text-xs font-medium text-red-600">{error}</span>}</div>;
}
