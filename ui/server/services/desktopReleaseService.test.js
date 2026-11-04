// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDesktopReleaseService } from './desktopReleaseService.js';

const manifest = { schemaVersion: 1, repository: 'AI9Stars/9GClaw', tag: 'v2026.10.28', version: '2026.1028.0',
  date: '2026-10-28', sourceSha: 'a'.repeat(40), assets: [{ name: 'installer.exe', size: 42, sha256: 'a'.repeat(64),
    sha512: 'A'.repeat(86) + '==', platform: 'win32', arch: 'x64' }] };
const response = data => ({ ok: true, json: async () => data });
const github = 'https://github.com/AI9Stars/9GClaw/releases/';
const stalled = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));

describe('GitHub-only desktop releases', () => {
  it('reads authoritative metadata only from the configured GitHub repository', async () => {
    const fetchImpl = vi.fn(async () => response(manifest));
    const service = createDesktopReleaseService({ fetchImpl });
    expect((await service.latestRelease()).version).toBe(manifest.version);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([github + 'latest/download/release.json']);
    expect(await service.downloadBases({ tagName: manifest.tag })).toEqual([github + 'download/' + manifest.tag + '/']);
  });
  it('ignores obsolete mirror and route-cache settings', async () => {
    const fetchImpl = vi.fn(async () => response(manifest));
    const read = vi.fn(), probe = vi.fn();
    const service = createDesktopReleaseService({ fetchImpl, mirrorBase: 'https://obsolete.invalid/', routeStore: { read }, probe });
    await service.latestRelease();
    expect(await service.downloadBases({ tagName: manifest.tag })).toEqual([github + 'download/' + manifest.tag + '/']);
    expect(read).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('supports a configured GitHub fork without falling back to another repository', async () => {
    const fetchImpl = vi.fn(async () => response({ ...manifest, repository: 'fork/9GClaw' }));
    await createDesktopReleaseService({ repository: 'fork/9GClaw', fetchImpl }).latestRelease();
    expect(fetchImpl.mock.calls[0][0]).toBe('https://github.com/fork/9GClaw/releases/latest/download/release.json');
  });
  it('recovers from a transient failure in the second attempt', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(manifest));
    expect((await createDesktopReleaseService({ fetchImpl }).latestRelease()).version).toBe(manifest.version);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it.each([null, { ...manifest, repository: 'other/repo' }, { ...manifest, tag: '../escape' }])('rejects inconsistent metadata: %j', async invalid => {
    await expect(createDesktopReleaseService({ fetchImpl: async () => response(invalid) }).latestRelease()).rejects.toThrow('checkFailed');
  });
  it('bounds stalled requests and reports a sanitized failure after two attempts', async () => {
    const fetchImpl = vi.fn(stalled);
    await expect(createDesktopReleaseService({ fetchImpl, timeoutMs: 20 }).latestRelease()).rejects.toThrow('checkFailed');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('checks exact payload availability and recovers when it becomes accessible', async () => {
    const checkDownload = vi.fn().mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce(undefined);
    const service = createDesktopReleaseService({ checkDownload });
    expect(await service.downloadAvailable({ tagName: manifest.tag }, manifest.assets[0])).toBe(false);
    expect(await service.downloadAvailable({ tagName: manifest.tag }, manifest.assets[0])).toBe(true);
    expect(checkDownload.mock.calls.every(([url, , size]) => url === github + 'download/' + manifest.tag + '/installer.exe' && size === 42)).toBe(true);
  });
  it('bounds payload checks and responds to cancellation', async () => {
    const service = createDesktopReleaseService({ checkDownload: (url, signal) => stalled(url, { signal }), timeoutMs: 20 });
    expect(await service.downloadAvailable({ tagName: manifest.tag }, manifest.assets[0])).toBe(false);
    const controller = new AbortController();
    const checking = service.downloadAvailable({ tagName: manifest.tag }, manifest.assets[0], controller.signal);
    controller.abort();
    expect(await checking).toBe(false);
    await expect(service.downloadBases({ tagName: manifest.tag }, manifest.assets[0], controller.signal)).rejects.toThrow();
  });
  it('rejects invalid download paths before contacting the network', async () => {
    const checkDownload = vi.fn();
    const service = createDesktopReleaseService({ checkDownload });
    expect(await service.downloadAvailable({ tagName: '../escape' }, manifest.assets[0])).toBe(false);
    expect(await service.downloadAvailable({ tagName: manifest.tag }, { ...manifest.assets[0], name: '../file.exe' })).toBe(false);
    expect(checkDownload).not.toHaveBeenCalled();
    await expect(service.downloadBases({ tagName: '../escape' })).rejects.toThrow('invalidUpdateMetadata');
  });
});
