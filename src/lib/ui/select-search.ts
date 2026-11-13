type SearchOption = { value: string; label: string; disabled?: boolean };

export function searchSelectOptions<T extends SearchOption>(options: readonly T[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = options.filter(option => terms.every(term => option.label.toLocaleLowerCase().includes(term)));
  return { visible: matches.slice(0, 50), count: matches.length };
}
