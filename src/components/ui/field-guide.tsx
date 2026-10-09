type GuideOptions = { name?: string; type?: string; placeholder?: string };

const examples: Record<string, string> = {
  "password": "Enter the password for your account.",
  "new password": "Use 12 to 128 characters. Keep your password private.",
  "confirm new password": "Enter the same new password again.",
  "engineer": "Choose the Engineer assigned to this site, or leave unassigned.",
  "foreman": "Choose the Foreman assigned to this site, or leave unassigned.",
  "term": "Choose Cash or Check to match how the supplier is being paid.",
  "reason type": "Choose Physical count, Damaged or Missing to explain the stock difference.",
  "transport type": "Choose a company vehicle or other transport used for this delivery.",
  "vehicle or transport description": "Example: ABC 1234, supplier truck. Identify the actual delivery vehicle.",
  "delivery vehicle": "Choose the company vehicle carrying these materials.",
  "employment type": "Example: Regular, Contract or Project-based.",
  "hourly management charge": "Enter the charge per hour in pesos, e.g. 500.00.",
  "rate amount": "Enter the amount per day or per hour, matching the selected rate type.",
  "decision note": "Briefly explain the review decision for the record history.",
  "review note": "Briefly explain what you checked and any concern found.",
  "quality or rejection note": "Describe damaged, missing or rejected goods and the quantity affected.",
  "material that fulfills this report": "Choose the catalog material that resolves the reported shortage.",
  "site material": "Choose a material currently held at this project site.",
  "warehouse code": "Example: WH-CEBU-01. Use uppercase letters, numbers and hyphens.",
  "project code": "Example: NNE-2026-001. Use a unique code for this project.",
  "equipment code": "Example: EQ-MIX-001. Use uppercase letters, numbers and hyphens.",
  "employee code": "Example: EMP-001. Use a unique code for this employee.",
  "supplier code": "Example: SUP-0001. Leave blank to generate a code automatically.",
  "vehicle code": "Example: VEH-0001. Leave blank to generate a code automatically.",
  "sku / material code": "Example: MAT-CEM-001. Use uppercase letters, numbers and hyphens.",
  "sku": "Optional catalog or model code, e.g. MIX-200.",
  "serial number": "Use uppercase letters and numbers from the equipment serial, e.g. MIX-001.",
  "plate number": "Example: ABC 1234. Use the vehicle's registered plate number.",
  "warehouse name": "Example: Cebu Main Warehouse.",
  "project name": "Example: Cebu Residential Building.",
  "material name": "Example: Portland Cement 40 kg.",
  "equipment name": "Example: Concrete Mixer 1.",
  "vehicle name": "Example: Delivery Truck 1.",
  "supplier name": "Use the store's name, e.g. City Hardware.",
  "store name": "Use the name printed on the hardware store receipt.",
  "registered business name": "Optional legal business name shown on the supplier's documents.",
  "equipment type": "Type any description, e.g. Concrete mixer or Hydraulic excavator.",
  "vehicle type": "Type any description, e.g. Dump truck, Pickup or Van.",
  "brand": "Example: Caterpillar or Makita.",
  "model": "Use the manufacturer's model, e.g. 320 GC.",
  "category name": "Example: General Labor. Choose a short, clear name.",
  "full name": "Example: Juan Dela Cruz.",
  "first name": "Example: Juan.",
  "middle name": "Optional middle name; leave blank if none.",
  "last name": "Example: Dela Cruz.",
  "client name": "Use the person or company being billed for the project.",
  "contact person": "Example: Juan Dela Cruz, the person to contact.",
  "driver": "Enter the delivery driver's full name.",
  "address": "Example: 123 Main Street, Barangay Lahug, Cebu City.",
  "store address": "Enter the hardware store's street, barangay and city.",
  "payment terms": "Example: Cash on delivery or 30 days.",
  "bank": "Enter the bank issuing the check.",
  "check no.": "Copy the check number exactly as printed on the check.",
  "tax identification number": "Optional supplier TIN; copy it from their official documents.",
  "weather conditions": "Example: Sunny, cloudy or light rain.",
  "quality note": "Describe the condition checked, including any damage or rejected goods.",
  "condition notes": "Example: Operational, with a minor scratch on the side.",
  "return condition": "Describe the condition on return and any maintenance needed.",
  "progress summary": "Briefly describe the work completed at the site.",
  "work note": "Describe the work completed, e.g. Poured ground-floor columns.",
  "usage note": "Describe where and how the material or asset was used.",
  "why it is needed": "Describe the site work that needs this material.",
  "purpose": "Describe the task and project site this request is for.",
  "document name": "Example: Ground Floor Plan. Use a name staff can recognize.",
  "document type": "Choose the type that best describes the uploaded document.",
  "assigned position": "Example: Mason, Carpenter or Site Supervisor.",
  "position at new site": "Example: Mason, Carpenter or Site Supervisor.",
  "rate type": "Choose whether this rate is paid per day or per hour.",
  "attendance costing basis": "Choose the basis used to calculate future attendance costs.",
  "hours used": "Enter actual operating hours, e.g. 4.5.",
  "hours worked": "Enter actual working hours, e.g. 8.",
  "paid day": "Choose the paid portion of the day for this attendance entry.",
  "complete": "Enter progress from 0 to 100, e.g. 25 for 25%.",
  "change amount": "Positive increases the budget; negative reduces it, e.g. -500.00.",
  "minimum stock level": "Enter the quantity that should trigger a low-stock warning, e.g. 10.",
  "ownership": "Choose Company owned, Rented or Leased.",
  "paid with": "Choose Company cash or Own money to identify who paid.",
  "lead engineer": "Select the Engineer responsible for the project.",
  "optional user account": "Link an existing account only if this employee uses the ERP.",
  "source warehouse": "Choose the warehouse supplying these materials.",
  "destination location": "Choose where the stock will be delivered.",
  "deliver to warehouse": "Choose the warehouse that will receive this purchase.",
  "current location": "Select where this equipment or vehicle is currently kept.",
  "base unit": "Choose how this material is counted, e.g. bag, piece or liter.",
  "unit": "Use the unit assigned to the selected material.",
  "material check": "Choose the inspection result for the delivered materials.",
  "initial role": "Choose the staff member's role. It controls their permitted actions.",
};

export function getFieldGuide(label: string, { name, type, placeholder }: GuideOptions = {}): string | undefined {
  if (["hidden", "checkbox", "radio", "file", "search"].includes(type ?? "")) return undefined;
  const key = label.toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
  if (examples[key]) return examples[key];
  if (/password/i.test(key + " " + name)) return "Use a strong password and keep it private.";
  if (/email/.test(key)) return "Example: juan@example.com. Enter an address you can access.";
  if (/phone|contact number/.test(key)) return "Example: 09171234567. Include the country code if needed.";
  if (/unit price|price/.test(key) && !/reason|note/.test(key)) return "Price for one unit in pesos, e.g. 150.00.";
  if (/amount|cost|value|charge/.test(key) && !/basis|reason|note/.test(key)) return "Enter the amount in pesos, e.g. 1500.00.";
  if (/quantity|stock level/.test(key)) return "Enter a number in the material's unit, e.g. 100.";
  if (/reason/.test(key) || name === "reason") return "Explain why this action is needed so it can be reviewed in the history.";
  if (/reference|receipt no/.test(key)) return "Copy the number from the receipt or supporting document, e.g. DR-001.";
  if (type === "date" || /date|needed by|required by|effective|valid until|completion|expected delivery/.test(key)) return "Choose the date that applies to this record.";
  if (/status/.test(key)) return "Choose the current status for this record.";
  if (/project|site|warehouse|supplier|hardware store|catalog material|^material$|equipment or vehicle|employee assignment|category|base unit|^unit$/.test(key)) return "Choose an existing record from the list.";
  if (/notes?|description|remarks|summary/.test(key)) return "Add a short description that other staff can understand.";
  if (placeholder && !/^(0(?:\.0+)?|select |search )/i.test(placeholder)) return `Example: ${placeholder.replace(/^e\.g\.\s*/i, "")}.`;
  return key ? `Enter the ${key} for this record.` : undefined;
}

export function FieldGuide({ label, name, type, placeholder }: { label: string } & GuideOptions) {
  const text = getFieldGuide(label, { name, type, placeholder });
  return text ? <span className="block text-xs font-normal leading-5 text-slate-500">{text}</span> : null;
}
