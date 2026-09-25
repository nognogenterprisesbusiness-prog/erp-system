// Base units only. Changing a unit never converts existing quantities.
export const demoMaterialUnitOptions = [
  { value: "bags", label: "Bags (bag)" },
  { value: "pieces", label: "Pieces (pc)" },
  { value: "boxes", label: "Boxes (box)" },
  { value: "rolls", label: "Rolls (roll)" },
  { value: "sets", label: "Sets (set)" },
  { value: "pails", label: "Pails (pail)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "g", label: "Grams (g)" },
  { value: "t", label: "Metric tons (t)" },
  { value: "L", label: "Liters (L)" },
  { value: "mL", label: "Milliliters (mL)" },
  { value: "m", label: "Meters (m)" },
  { value: "cm", label: "Centimeters (cm)" },
  { value: "m²", label: "Square meters (m²)" },
  { value: "m³", label: "Cubic meters (m³)" },
] as const;
