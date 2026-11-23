export type DayPart = 'dawn' | 'day' | 'dusk' | 'night';

/** Local hour (0-23) to a part of the day, used to tint the ambient background. */
export function dayPartFor(hour: number): DayPart {
  if (hour >= 5 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}
