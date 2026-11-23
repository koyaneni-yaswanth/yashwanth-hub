/**
 * Stale-deploy recovery. After a new deploy the old hashed page files are gone,
 * so a tab still running the previous bundle fails to load lazy pages. One
 * reload fetches the new version; a 30 s guard prevents reload loops (e.g. when
 * offline or if the new deploy is itself broken).
 */
const CHUNK_RELOAD_FLAG = 'yash_chunk_reload_at';
const GUARD_MS = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(
    message
  );
}

/** Reloads the page unless it already did so in the last 30 s. Returns true if a reload started. */
export function reloadOnceForNewVersion(now = Date.now()): boolean {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_FLAG) || 0);
    if (now - last <= GUARD_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, String(now));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}
