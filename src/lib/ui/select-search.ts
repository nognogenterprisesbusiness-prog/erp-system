type SearchOption = { value: string; label: string; secondary?: string; disabled?: boolean };

export function searchSelectOptions<T extends SearchOption>(options: readonly T[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const visible: T[] = [];
  let count = 0;
  for (const option of options) {
    const text = `${option.label} ${option.secondary ?? ""}`.toLocaleLowerCase();
    if (!terms.every(term => text.includes(term))) continue;
    count++;
    if (visible.length < 50) visible.push(option);
  }
  return { visible, count };
}
