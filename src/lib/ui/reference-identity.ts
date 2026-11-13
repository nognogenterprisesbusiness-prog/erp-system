/** Display adapter for the existing code-first reference RPC contract. */
export function separateReferenceCode(value: string): { label: string; secondary?: string } {
  const boundary = value.indexOf(" · ");
  if (boundary < 0) return { label: value };
  return { label: value.slice(boundary + 3), secondary: value.slice(0, boundary) };
}
