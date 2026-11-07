/** Zero-based axis with round steps (1, 2, 2.5 or 5 × 10ⁿ), so labels read 0, 1K, 2K… */
export function niceTicks(maximum: number, count = 4): number[] {
  const top = Number.isFinite(maximum) && maximum > 0 ? maximum : 1;
  const raw = top / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? 10 * magnitude;
  const steps = Math.ceil(top / step - 1e-9);
  return Array.from({ length: steps + 1 }, (_, index) => Number((index * step).toPrecision(12)));
}

/** Evenly spaced month bands; bars sit in the middle of each band. */
export function monthBands(count: number, left: number, right: number) {
  const band = count > 0 ? (right - left) / count : right - left;
  const width = Math.max(4, Math.min(56, band * 0.56));
  return { band, width, center: (index: number) => left + band * (index + 0.5) };
}

/** Stacks non-negative values bottom-up; each segment keeps its own value. */
export function stackSegments(values: number[]) {
  let base = 0;
  return values.map((raw) => {
    const value = Number.isFinite(raw) && raw > 0 ? raw : 0;
    const segment = { from: base, to: base + value, value };
    base += value;
    return segment;
  });
}

/** Rounded annular sector; the corner radius shrinks with tiny categories. */
export function ringSegment(start: number, end: number, outer = 94, inner = 66): string {
  const point = (radius: number, angle: number) => `${110 + radius * Math.sin(angle)},${110 - radius * Math.cos(angle)}`;
  const corner = Math.max(0, Math.min(6, (outer - inner) / 2, inner * (end - start) / 2.2));
  const large = end - start > Math.PI ? 1 : 0;
  return `M${point(outer, start + corner / outer)} A${outer},${outer} 0 ${large} 1 ${point(outer, end - corner / outer)} Q${point(outer, end)} ${point(outer - corner, end)} L${point(inner + corner, end)} Q${point(inner, end)} ${point(inner, end - corner / inner)} A${inner},${inner} 0 ${large} 0 ${point(inner, start + corner / inner)} Q${point(inner, start)} ${point(inner + corner, start)} L${point(outer - corner, start)} Q${point(outer, start)} ${point(outer, start + corner / outer)} Z`;
}
