export function safeSearchTerm(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 80);
}
