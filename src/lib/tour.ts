/** Whether this browser has seen (or dismissed) the Momentum onboarding tour. */
export const TOUR_SEEN_KEY = 'yash_os_tour_seen_v1';

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    return true; // storage blocked: don't nag
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
  } catch {
    /* storage blocked */
  }
}
