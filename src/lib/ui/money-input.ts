/** Group the integer part without rounding, truncating or coercing a decimal. */
export function ungroupMoney(value: string): string {
  return value.replaceAll(",", "");
}

export function groupMoney(value: string): string {
  const raw = ungroupMoney(value);
  if (!/^\d*(\.\d*)?$/.test(raw)) return value;
  const [whole, fraction] = raw.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

export function moneyCaret(display: string, characterCount: number): number {
  if (characterCount <= 0) return 0;
  let count = 0;
  for (let index = 0; index < display.length; index++) {
    if (display[index] !== ",") count++;
    if (count === characterCount) return index + 1;
  }
  return display.length;
}
