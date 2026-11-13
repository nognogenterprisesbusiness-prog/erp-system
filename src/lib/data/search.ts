export function safeSearchTerm(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 80);
}

export function safeAccountSearchTerm(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/[^\p{L}\p{N} .@_-]/gu, "").trim().slice(0, 80);
}
