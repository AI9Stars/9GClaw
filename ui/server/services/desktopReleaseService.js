import { RELEASE_TAG, normalizeRepository, validateReleaseManifest } from './releaseService.js';

// Resolve every URL locally: release metadata cannot introduce another host.
export function createDesktopReleaseService({ repository: value, fetchImpl = fetch, checkDownload, timeoutMs = 8000 } = {}) {
  const repository = normalizeRepository(value);
  const github = `https://github.com/${repository}/releases/`;
  return {
    async latestRelease() {
      for (let round = 0; round < 2; round++) {
        try {
          const response = await fetchImpl(`${github}latest/download/release.json`, {
            signal: AbortSignal.timeout(timeoutMs),
            headers: { Accept: 'application/json', 'User-Agent': '9GClaw-Updater', 'Cache-Control': 'no-cache' },
          });
          if (!response.ok) throw new Error('Release request failed');
          return validateReleaseManifest(await response.json(), repository);
        } catch { /* Retry a transient GitHub failure once. */ }
      }
      throw new Error('checkFailed');
    },
    async downloadAvailable(release, asset, signal) {
      signal?.throwIfAborted();
      if (!RELEASE_TAG.test(release.tagName || '') || !/^[\w.-]+$/.test(asset.name || '')
          || !Number.isSafeInteger(asset.size) || asset.size <= 0) return false;
      const stop = new AbortController();
      const bounded = AbortSignal.any([stop.signal, AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
      try {
        await checkDownload(`${github}download/${release.tagName}/${encodeURIComponent(asset.name)}`, bounded, asset.size);
        signal?.throwIfAborted();
        return true;
      } catch { return false; }
      finally { stop.abort(); }
    },
    async downloadBases(release, _asset, signal) {
      signal?.throwIfAborted();
      if (!RELEASE_TAG.test(release.tagName || '')) throw new Error('invalidUpdateMetadata');
      // A single source needs no route cache or speed race before downloading.
      return [`${github}download/${release.tagName}/`];
    },
  };
}
