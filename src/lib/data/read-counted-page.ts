type CountedResult<T> = { data: T[] | null; count: number | null; error: { code?: string; message: string } | null };

/** Recovers stale pagination offsets without treating authorization or query failures as empty data. */
export async function readCountedPage<T>(load: (from: number, to: number) => PromiseLike<CountedResult<T>>, page: number, label: string, pageSize = 20) {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error("Invalid database page.");
  let currentPage = page;
  let result = await load((page - 1) * pageSize, page * pageSize - 1);
  const emptyOffset = !result.error && !result.data?.length && result.count !== null && result.count <= (page - 1) * pageSize;
  if (page > 1 && (result.error?.code === "PGRST103" || emptyOffset)) {
    currentPage = 1;
    if (result.error || result.count !== 0) result = await load(0, pageSize - 1);
  }
  if (result.error) throw new Error(`Unable to load ${label}.`, { cause: result.error });
  return { data: result.data ?? [], count: result.count ?? 0, page: currentPage };
}
