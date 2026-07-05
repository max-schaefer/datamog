/**
 * Wrap an async loader so it's invoked at most once on success but
 * *not* cached after a rejection. The classic "lazy singleton"
 * pattern, plus the recovery guard that the sql.js loader in
 * `worker/executor.ts` introduced after a transient CDN failure had
 * been observed to leave the worker permanently stuck against a
 * rejected promise.
 *
 * Usage:
 *
 *   const loadMermaid = lazyAsync(() => import("mermaid").then((m) => m.default));
 *
 * Subsequent successful calls return the same resolved promise.
 * After a rejection, the next call re-runs the loader.
 */
export function lazyAsync<T>(loader: () => Promise<T>): () => Promise<T> {
  let cache: Promise<T> | null = null;
  return () => {
    if (!cache) {
      const p = loader();
      cache = p;
      // Clear the slot on rejection so the next caller retries from
      // scratch. The identity check guards against a later success
      // having already overwritten the slot.
      p.catch(() => {
        if (cache === p) cache = null;
      });
    }
    return cache;
  };
}
