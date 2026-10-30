/** Scale includes zero and negative net values without changing the plotted data. */
export function chartScale(values: number[]): { minimum: number; maximum: number } {
  const minimum = values.reduce((smallest, value) => Math.min(smallest, value), 0);
  const maximum = values.reduce((largest, value) => Math.max(largest, value), 0);
  const magnitude = Math.max(Math.abs(minimum), maximum) || 1;
  const step = 10 ** Math.floor(Math.log10(magnitude));
  return { minimum: Math.floor(minimum / step) * step, maximum: maximum === 0 && minimum < 0 ? 0 : Math.max(step, Math.ceil(maximum / step) * step) };
}

export function monthPosition(index: number, count: number, left: number, right: number): number {
  return count <= 1 ? (left + right) / 2 : left + index * (right - left) / (count - 1);
}
