/**
 * Concurrency helpers for one-time startup work. Dependency-free so they can be
 * unit tested in Node without a browser.
 */

/** Minimal shape of the Web Locks API (navigator.locks). */
export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/**
 * Wraps an async function so concurrent callers share one in-flight run, and later
 * callers reuse the settled result. A failed run is forgotten so it can be retried.
 */
export function createSingleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = fn().catch((err) => {
        inFlight = null;
        throw err;
      });
    }
    return inFlight;
  };
}

/**
 * Runs `fn` while holding a named cross-tab lock when the platform supports it.
 * Without Web Locks it just runs `fn`; callers must still be safe under races
 * (e.g. by writing seed rows with deterministic ids via put/bulkPut).
 */
export async function runWithLock<T>(
  locks: LockManagerLike | undefined | null,
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  if (locks && typeof locks.request === 'function') {
    return locks.request(name, fn);
  }
  return fn();
}
