export function pageNumber(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 10000) : 1;
}
export const HISTORY_PAGE_SIZE = 20;
