/** Clean axis maths shared by the charts. Pure, no React. */

/**
 * A "nice" set of evenly spaced ticks from 0 up to at least `max`.
 * `integer` (the default) keeps steps whole, for counts like tasks or minutes.
 */
export function niceTicks(max: number, count = 4, integer = true): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rough = max / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const multipliers = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  let step = multipliers.map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  if (integer) step = Math.max(1, Math.round(step));
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/** 1,284 / 12.9K / 4.2M — compact once a value reaches 10,000. */
export function compactNumber(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (a >= 10_000) return `${(n / 1000).toFixed(a >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('en-IN');
}
