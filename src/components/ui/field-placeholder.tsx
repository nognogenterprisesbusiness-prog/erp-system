import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { Input } from "./input";

type InputOptions = { type?: string; inputMode?: string };
const examples: Record<string, string> = {
  "warehouse code": "WH-CEBU-01", "project code": "NNE-2026-001",
  "equipment code": "EQ-MIX-001", "employee code": "EMP-001",
  "supplier code": "SUP-0001", "vehicle code": "VEH-0001",
  "sku / material code": "MAT-CEM-001", sku: "MIX-200", "serial number": "MIX-001",
  "warehouse name": "Cebu Main Warehouse", "project name": "Cebu Residential Building",
  "material name": "Portland Cement 40 kg", "equipment name": "Concrete Mixer 1",
  "vehicle name": "Delivery Truck 1", "supplier name": "City Hardware", "store name": "City Hardware",
  "registered business name": "City Hardware Inc.", "equipment type": "Concrete mixer", "vehicle type": "Dump truck",
  brand: "Honda", model: "GX160", "plate number": "ABC 1234",
  "full name": "Rich Manoloy", "first name": "Rich", "middle name": "Santos", "last name": "Manoloy",
  "contact person": "Rich Manoloy", "client name": "Rich Manoloy", driver: "Rich Manoloy",
  address: "123 Main Street, Lahug, Cebu City", "store address": "123 Main Street, Lahug, Cebu City",
  "payment terms": "Cash on delivery", bank: "Metrobank", "check no.": "123456",
  "tax identification number": "123-456-789-000", "document name": "Ground Floor Plan",
  "category name": "General Labor", "assigned position": "Mason", "position at new site": "Mason",
  "employment type": "Project-based", "weather conditions": "Sunny",
  "change amount": "-500.00", complete: "25", "hours used": "4.5", "hours worked": "8",
  "minimum stock level": "10", "condition notes": "Operational, minor scratches",
  "return condition": "Returned in good condition", "quality note": "2 bags damaged",
  "quality or rejection note": "2 bags damaged", "progress summary": "Ground-floor columns completed",
  "work note": "Poured ground-floor columns", "usage note": "Cement used for ground-floor columns",
  "why it is needed": "Concrete work at the main site", purpose: "Concrete work at the main site",
  "vehicle or transport description": "ABC 1234, supplier truck",
};

export function getFieldPlaceholder(label: string, { type, inputMode }: InputOptions = {}): string | undefined {
  if (["hidden", "checkbox", "radio", "file", "search", "date", "datetime-local", "time"].includes(type ?? "")) return undefined;
  const key = label.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
  if (examples[key]) return examples[key];
  if (type === "password" || /password/.test(key)) return "Enter password";
  if (type === "email" || /email/.test(key)) return "rich@example.com";
  if (type === "tel" || /phone|contact number/.test(key)) return "09150365602";
  if (/address/.test(key)) return examples.address;
  if (/price|amount|cost|value|charge/.test(key) && !/reason|note|basis/.test(key)) return "1500.00";
  if (/quantity/.test(key) || type === "number" || inputMode === "numeric" || inputMode === "decimal") return "100";
  if (/reason/.test(key)) return "Incorrect details recorded";
  if (/reference|receipt no/.test(key)) return "DR-001";
  if (/notes?|description|remarks|summary/.test(key)) return "Delivery for ground-floor concrete work";
  return undefined;
}

// Only editable text controls receive examples; select/date widgets keep their own prompts.
export function withFieldPlaceholder(children: ReactNode, label: string): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ placeholder?: string; type?: string; inputMode?: string; children?: ReactNode }>(child)) return child;
    if (child.type === "input" || child.type === "textarea" || child.type === Input) {
      const example = getFieldPlaceholder(label, child.props);
      return example ? cloneElement(child, { placeholder: example }) : child;
    }
    if (typeof child.type === "string" && child.props.children) {
      return cloneElement(child, { children: withFieldPlaceholder(child.props.children, label) });
    }
    return child;
  });
}
