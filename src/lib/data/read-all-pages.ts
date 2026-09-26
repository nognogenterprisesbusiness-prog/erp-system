type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** Read a bounded database page at a time; callers must use a stable unique sort. */
export async function readAllPages<T>(load: (from: number, to: number) => PromiseLike<PageResult<T>>, label: string, pageSize = 500): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error("Invalid database page size.");
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await load(from, from + pageSize - 1);
    if (error) throw new Error(`Unable to load ${label}.`, { cause: error });
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

/** Avoid long URL filters and result truncation when resolving many related IDs. */
export async function readByIds<T>(ids: string[], load: (ids: string[], from: number, to: number) => PromiseLike<PageResult<T>>, label: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batchIds = ids.slice(offset, offset + 100);
    rows.push(...await readAllPages((from, to) => load(batchIds, from, to), label));
  }
  return rows;
}
