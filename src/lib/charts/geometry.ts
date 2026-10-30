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

export type ChartPoint = readonly [number, number];

/** Monotone cubic interpolation: passes through the samples without inventing peaks. */
export function monotonePath(points: ChartPoint[]): string {
  if (!points.length) return "";
  if (points.length < 3) return points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const slopes = points.slice(1).map(([x, y], i) => (y - points[i][1]) / (x - points[i][0]));
  const tangents = points.map((_, i) => i === 0 ? slopes[0] : i === points.length - 1 ? slopes[i - 1] : slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2);
  slopes.forEach((slope, i) => {
    if (slope === 0) { tangents[i] = 0; tangents[i + 1] = 0; return; }
    const length = Math.hypot(tangents[i] / slope, tangents[i + 1] / slope);
    if (length > 3) { tangents[i] *= 3 / length; tangents[i + 1] *= 3 / length; }
  });
  return points.slice(1).reduce((path, [x, y], i) => {
    const [previousX, previousY] = points[i];
    const third = (x - previousX) / 3;
    return `${path} C${previousX + third},${previousY + tangents[i] * third} ${x - third},${y - tangents[i + 1] * third} ${x},${y}`;
  }, `M${points[0][0]},${points[0][1]}`);
}

/** Rounded annular sector; the corner radius shrinks with tiny categories. */
export function ringSegment(start: number, end: number, outer = 94, inner = 66): string {
  const point = (radius: number, angle: number) => `${110 + radius * Math.sin(angle)},${110 - radius * Math.cos(angle)}`;
  const corner = Math.max(0, Math.min(6, (outer - inner) / 2, inner * (end - start) / 2.2));
  const large = end - start > Math.PI ? 1 : 0;
  return `M${point(outer, start + corner / outer)} A${outer},${outer} 0 ${large} 1 ${point(outer, end - corner / outer)} Q${point(outer, end)} ${point(outer - corner, end)} L${point(inner + corner, end)} Q${point(inner, end)} ${point(inner, end - corner / inner)} A${inner},${inner} 0 ${large} 0 ${point(inner, start + corner / inner)} Q${point(inner, start)} ${point(inner + corner, start)} L${point(outer - corner, start)} Q${point(outer, start)} ${point(outer, start + corner / outer)} Z`;
}
