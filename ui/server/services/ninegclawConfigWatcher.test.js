import {
  mkdtempSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

let watcherModule;
let tempDir;

afterEach(() => {
  watcherModule?.stopNineGClawConfigWatcher();
  watcherModule = null;
  delete process.env.NINEGCLAW_CONFIG_PATH;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('9gclaw config watcher', () => {
  it('reloads when a symlink target is atomically replaced', async () => {
    tempDir = mkdtempSync(join(tmpdir(), '9gclaw-config-watcher-'));
    const linkDir = join(tempDir, 'link');
    const targetDir = join(tempDir, 'managed');
    mkdirSync(linkDir);
    mkdirSync(targetDir);
    const configPath = join(linkDir, '9gclaw.yaml');
    const targetPath = join(targetDir, '9gclaw.yaml');
    writeFileSync(targetPath, 'schemaVersion: 1\ncustomEnv:\n  VALUE: before\n', 'utf8');
    symlinkSync(targetPath, configPath);
    process.env.NINEGCLAW_CONFIG_PATH = configPath;

    const reloadNineGClawConfig = vi.fn(async () => ({ reloaded: true }));
    vi.doMock('./ninegclawConfigReloader.js', () => ({ reloadNineGClawConfig }));
    watcherModule = await import('./ninegclawConfigWatcher.js');

    const event = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for config event')), 3000);
      void watcherModule.startNineGClawConfigWatcher({
        onEvent: (payload) => {
          clearTimeout(timeout);
          resolve(payload);
        },
      }).then(() => {
        const replacement = join(targetDir, '.9gclaw.yaml.external.tmp');
        writeFileSync(replacement, 'schemaVersion: 1\ncustomEnv:\n  VALUE: after\n', 'utf8');
        renameSync(replacement, targetPath);
      }).catch(reject);
    });

    await expect(event).resolves.toMatchObject({
      source: 'watcher',
      config: { customEnv: { VALUE: 'after' } },
    });
    expect(reloadNineGClawConfig).toHaveBeenCalledOnce();
  });
});
