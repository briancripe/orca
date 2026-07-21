/* Generic TTL-cache/in-flight-dedupe/mutation-guard execution for the beads
   store slice (./beads.ts) — every beads read action (list/detail/labels/
   diagnose) shares the same fresh-check → dedupe → fetch → guarded-write
   shape, so it's factored out once here instead of repeated per action. */
import {
  beginBeadsMutation,
  currentBeadsMutationGeneration,
  isBeadsCacheEntryFresh,
  isCurrentBeadsMutation,
  type InflightBeadsRequest
} from './beads-cache'
import type { CacheEntry } from './github'

export async function runCachedBeadsRead<T>(params: {
  cached: CacheEntry<T> | undefined
  fallback: T
  force: boolean
  inflightMap: Map<string, InflightBeadsRequest<T>>
  cacheKey: string
  fetch: () => Promise<T>
  writeCache: (data: T) => void
  logLabel: string
}): Promise<T> {
  const { cached, fallback, force, inflightMap, cacheKey, fetch, writeCache, logLabel } = params
  if (!force && isBeadsCacheEntryFresh(cached)) {
    return cached.data ?? fallback
  }

  const inflight = inflightMap.get(cacheKey)
  if (inflight && (!force || inflight.force)) {
    return inflight.promise
  }

  let entry: InflightBeadsRequest<T>
  const capturedGeneration = currentBeadsMutationGeneration()
  const promise = fetch()
    .then((result) => {
      if (inflightMap.get(cacheKey) === entry && isCurrentBeadsMutation(capturedGeneration)) {
        writeCache(result)
      }
      return result
    })
    .catch((error) => {
      console.warn(`[beads] ${logLabel} failed:`, error)
      throw error
    })
    .finally(() => {
      if (inflightMap.get(cacheKey) === entry) {
        inflightMap.delete(cacheKey)
      }
    })
  entry = { promise, force, mutationGeneration: capturedGeneration }
  inflightMap.set(cacheKey, entry)
  return promise
}

// Why: every beads write follows the same "call, then only invalidate on
// `ok: true`" shape — bumping the mutation generation before invalidating so
// any read already in flight can't repopulate what's about to be cleared.
export async function runBeadsMutation<T extends { ok: boolean }>(
  call: () => Promise<T>,
  onSuccess: () => void
): Promise<T> {
  const result = await call()
  if (result.ok) {
    beginBeadsMutation()
    onSuccess()
  }
  return result
}
