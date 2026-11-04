import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProjectId } from './pilotPaths.js';

import {
    ensureGeneralWorkspaceDirectory,
    resolveGeneralWorkspaceDirectory,
} from './generalWorkspace.js';

const temporaryRoots = [];
const systemFolders = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: systemFolders.query }));

async function makeTemporaryRoot() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), '9gclaw-general-workspace-'));
    temporaryRoots.push(root);
    return root;
}

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(temporaryRoots.splice(0).map((root) => (
        fs.rm(root, { recursive: true, force: true })
    )));
});
describe('General workspace isolation', () => {
    it.each(['general', '9GClaw2'])('resumes repeated interrupted numbered migrations from %s in the same directory after restart', async legacyName => {
        const root = await makeTemporaryRoot();
        const env = { NINEGCLAW_HOME: path.join(root, 'profile'), WORKSPACES_ROOT: root };
        await fs.writeFile(path.join(root, '9GClawGeneral'), 'occupied default');
        const source = path.join(root, legacyName);
        await fs.mkdir(source);
        if (legacyName === '9GClaw2') {
            await fs.mkdir(env.NINEGCLAW_HOME);
            await fs.writeFile(path.join(source, '.9gclaw-workspace'), JSON.stringify({ product: '9GClaw', version: 1, id: 'legacy-id' }));
            await fs.writeFile(path.join(env.NINEGCLAW_HOME, 'general-workspace.json'), JSON.stringify({ version: 1, baseDirectory: path.join(root, '9GClaw'), directory: source, workspaceId: 'legacy-id' }));
        }
        await fs.writeFile(path.join(source, 'a.txt'), 'first file');
        await fs.writeFile(path.join(source, 'b.txt'), 'second file');
        const link = fs.link.bind(fs);
        const publish = vi.spyOn(fs, 'link').mockImplementationOnce(link)
            .mockRejectedValueOnce(Object.assign(new Error('Disk full'), { code: 'ENOSPC' }));
        await expect(ensureGeneralWorkspaceDirectory(env)).rejects.toMatchObject({ code: 'ENOSPC' });
        const claimed = path.join(root, '9GClawGeneral2');
        expect(await fs.readFile(path.join(claimed, 'a.txt'), 'utf8')).toBe('first file');
        const statePath = path.join(env.NINEGCLAW_HOME, 'general-workspace.json');
        const pending = JSON.parse(await fs.readFile(statePath, 'utf8'));
        expect(pending).toMatchObject({ directory: claimed, migration: { phase: 'pending', source: legacyName === 'general' ? null : { directory: source, workspaceId: 'legacy-id' } } });
        publish.mockRestore();
        vi.resetModules();
        const restarted = await import('./generalWorkspace.js');
        const failAgain = vi.spyOn(fs, 'link').mockRejectedValueOnce(Object.assign(new Error('Still full'), { code: 'ENOSPC' }));
        await expect(restarted.ensureGeneralWorkspaceDirectory({ ...env })).rejects.toMatchObject({ code: 'ENOSPC' });
        expect(JSON.parse(await fs.readFile(statePath, 'utf8')).workspaceId).toBe(pending.workspaceId);
        failAgain.mockRestore();
        expect(await restarted.ensureGeneralWorkspaceDirectory({ ...env })).toBe(claimed);
        expect(await fs.readFile(path.join(claimed, 'b.txt'), 'utf8')).toBe('second file');
        expect(await fs.readdir(root)).not.toContain('9GClawGeneral3');
        expect(await fs.readFile(path.join(source, 'a.txt'), 'utf8')).toBe('first file');
        expect(JSON.parse(await fs.readFile(statePath, 'utf8')).migration).toBeUndefined();
    });
    it('persists custom YAML directory claims across turns and process restarts', async () => {
        const root = await makeTemporaryRoot();
        const env = { NINEGCLAW_HOME: path.join(root, 'profile'), NINEGCLAW_GENERAL_WORKSPACE_DIRECTORY: path.join(root, 'custom') };
        const directory = await ensureGeneralWorkspaceDirectory({ ...env });
        await fs.writeFile(path.join(directory, 'report.md'), 'first turn');
        expect(await ensureGeneralWorkspaceDirectory({ ...env })).toBe(directory);
        vi.resetModules();
        const restarted = await import('./generalWorkspace.js');
        expect(await restarted.ensureGeneralWorkspaceDirectory({ ...env })).toBe(directory);
        await fs.writeFile(path.join(directory, '.9gclaw-workspace'), JSON.stringify({ product: '9GClaw', version: 1, id: 'replacement' }));
        await expect(restarted.ensureGeneralWorkspaceDirectory({ ...env })).rejects.toMatchObject({ code: 'GENERAL_WORKSPACE_STATE_INVALID' });
    });
    it('serializes concurrent custom claims and refuses an unclaimed populated YAML directory', async () => {
        const root = await makeTemporaryRoot();
        const env = { NINEGCLAW_HOME: path.join(root, 'profile'), NINEGCLAW_GENERAL_WORKSPACE_DIRECTORY: path.join(root, 'custom') };
        const claimed = await Promise.all(Array.from({ length: 4 }, () => ensureGeneralWorkspaceDirectory({ ...env })));
        expect(new Set(claimed)).toEqual(new Set([env.NINEGCLAW_GENERAL_WORKSPACE_DIRECTORY]));
        const other = path.join(root, 'occupied');
        await fs.mkdir(other);
        await fs.writeFile(path.join(other, '.hidden'), 'user data');
        await expect(ensureGeneralWorkspaceDirectory({ ...env, NINEGCLAW_GENERAL_WORKSPACE_DIRECTORY: other })).rejects.toMatchObject({ code: 'GENERAL_WORKSPACE_NOT_EMPTY' });
        expect(await fs.readdir(other)).toEqual(['.hidden']);
    });
    it('copies the previous 9GClaw directory into the new default when General history proves an upgrade', async () => {
        const root = await makeTemporaryRoot();
        const pilotHome = path.join(root, 'profile');
        const transcriptDirectory = path.join(pilotHome, 'projects', createProjectId(pilotHome), 'chats');
        await fs.mkdir(transcriptDirectory, { recursive: true });
        await fs.writeFile(path.join(transcriptDirectory, 'existing.jsonl'), '{"fixture":true}\n');
        const legacy = path.join(root, 'workspaces', '9GClaw');
        await fs.mkdir(legacy, { recursive: true });
        await fs.writeFile(path.join(legacy, 'report.md'), 'previous version file');
        const env = { NINEGCLAW_HOME: pilotHome, WORKSPACES_ROOT: path.join(root, 'workspaces') };
        const current = path.join(path.dirname(legacy), '9GClawGeneral');
        expect(await ensureGeneralWorkspaceDirectory(env)).toBe(current);
        expect(await ensureGeneralWorkspaceDirectory(env)).toBe(current);
        expect(resolveGeneralWorkspaceDirectory(env)).toBe(current);
        expect(await fs.readFile(path.join(current, 'report.md'), 'utf8')).toBe('previous version file');
        expect(await fs.readFile(path.join(legacy, 'report.md'), 'utf8')).toBe('previous version file');
        expect(await fs.readFile(path.join(transcriptDirectory, 'existing.jsonl'), 'utf8')).toBe('{"fixture":true}\n');
    });
    it.each(['runtime', 'resources-sibling', 'install-sibling', 'install-root', 'install-parent'])('rejects a custom workspace overlapping the complete desktop installation: %s', async kind => {
        const root = await makeTemporaryRoot();
        const installation = path.join(root, 'application');
        const runtime = path.join(installation, 'resources', 'runtime');
        await fs.mkdir(runtime, { recursive: true });
        const candidate = { runtime, 'resources-sibling': path.join(installation, 'resources', 'user-workspace'),
            'install-sibling': path.join(installation, 'user-workspace'), 'install-root': installation, 'install-parent': root }[kind];
        const env = { NINEGCLAW_HOME: path.join(root, 'profile'), NINEGCLAW_DESKTOP_RUNTIME_ROOT: runtime,
            NINEGCLAW_GENERAL_WORKSPACE_DIRECTORY: candidate };
        await expect(ensureGeneralWorkspaceDirectory(env)).rejects.toMatchObject({ code: 'GENERAL_WORKSPACE_UNSAFE' });
        expect(await fs.readdir(runtime)).toEqual([]);
        expect(await fs.readdir(installation)).toEqual(['resources']);
    });
    it.each(['win32', 'darwin', 'linux'])('uses an explicitly configured exact directory on %s', (platform) => {
        const homeDirectory = path.resolve('fixture-user');
        const directory = path.resolve('custom-directory');
        expect(resolveGeneralWorkspaceDirectory({ NINEGCLAW_HOME: path.join(homeDirectory, '.9gclaw'),
            WORKSPACES_ROOT: path.resolve('other-root'), NINEGCLAW_GENERAL_WORKSPACE_DIRECTORY: directory }, {
            platform, homeDirectory,
        })).toBe(directory);
        expect(resolveGeneralWorkspaceDirectory({ NINEGCLAW_GENERAL_WORKSPACE_DIRECTORY: '~/Custom' }, {
            platform, homeDirectory,
        })).toBe(path.join(homeDirectory, 'Custom'));
    });

    it('rejects relative custom paths and paths containing the profile', () => {
        expect(() => resolveGeneralWorkspaceDirectory({ NINEGCLAW_GENERAL_WORKSPACE_DIRECTORY: 'relative' })).toThrow('absolute path');
        const pilotHome = path.resolve('profile');
        for (const directory of [pilotHome, path.join(pilotHome, 'child'), path.dirname(pilotHome)]) {
            expect(() => resolveGeneralWorkspaceDirectory({ NINEGCLAW_HOME: pilotHome, NINEGCLAW_GENERAL_WORKSPACE_DIRECTORY: directory })).toThrow('separate from NINEGCLAW_HOME');
        }
    });

    it('does not import legacy files into a user-selected custom folder', async () => {
        const root = await makeTemporaryRoot();
        await fs.mkdir(path.join(root, 'general'));
        await fs.writeFile(path.join(root, 'general', 'report.md'), 'legacy');
        const result = await ensureGeneralWorkspaceDirectory({ NINEGCLAW_HOME: path.join(root, 'profile'), WORKSPACES_ROOT: root,
            NINEGCLAW_GENERAL_WORKSPACE_DIRECTORY: path.join(root, 'custom') });
        expect(await fs.readdir(result)).toEqual(['.9gclaw-workspace']);
        expect(await fs.readFile(path.join(root, 'general', 'report.md'), 'utf8')).toBe('legacy');
    });

    it('rejects a linked ancestor before creating a directory in the profile', async () => {
        const root = await makeTemporaryRoot();
        const pilotHome = path.join(root, 'profile');
        await fs.mkdir(pilotHome);
        await fs.symlink(pilotHome, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
        await expect(ensureGeneralWorkspaceDirectory({ NINEGCLAW_HOME: pilotHome,
            NINEGCLAW_GENERAL_WORKSPACE_DIRECTORY: path.join(root, 'link', 'must-not-create') })).rejects.toMatchObject({ code: 'GENERAL_WORKSPACE_UNSAFE' });
        expect(await fs.readdir(pilotHome)).toEqual([]);
    });
    it.each(['win32', 'darwin', 'linux'].flatMap(platform => ['general', '9GClaw', 'both'].map(legacy => [platform, legacy])))('migrates %s legacy %s files before returning the new cwd', async (platform, legacy) => {
        const root = await makeTemporaryRoot();
        const homeDirectory = path.join(root, 'user home');
        const documentsDirectory = path.join(root, 'redirected 文档');
        const pilotHome = path.join(root, 'pilot-home');
        const parent = platform === 'win32' ? documentsDirectory : homeDirectory;
        const sources = [];
        if (legacy !== '9GClaw') sources.push(path.join(homeDirectory, 'general'));
        if (legacy !== 'general') sources.push(path.join(parent, '9GClaw'));
        const transcripts = path.join(pilotHome, 'projects', createProjectId(pilotHome), 'chats');
        await fs.mkdir(transcripts, { recursive: true });
        await fs.writeFile(path.join(transcripts, 'existing.jsonl'), 'history');
        for (const source of sources) {
            await fs.mkdir(source, { recursive: true });
            await fs.writeFile(path.join(source, 'report.md'), `legacy ${path.basename(source)}`);
        }
        const result = await ensureGeneralWorkspaceDirectory({ NINEGCLAW_HOME: pilotHome, WORKSPACES_ROOT: homeDirectory }, {
            platform, homeDirectory, documentsDirectory,
        });
        expect(result).toBe(path.join(platform === 'win32' ? documentsDirectory : homeDirectory, '9GClawGeneral'));
        expect(await fs.readFile(path.join(result, 'report.md'), 'utf8')).toBe(`legacy ${legacy === 'general' ? 'general' : '9GClaw'}`);
        if (legacy === 'both') expect(await fs.readFile(path.join(result, 'report (from general).md'), 'utf8')).toBe('legacy general');
        for (const source of sources) expect(await fs.readFile(path.join(source, 'report.md'), 'utf8')).toBe(`legacy ${path.basename(source)}`);
        expect(await ensureGeneralWorkspaceDirectory({ NINEGCLAW_HOME: pilotHome, WORKSPACES_ROOT: homeDirectory }, { platform, homeDirectory, documentsDirectory })).toBe(result);
        expect(await fs.readFile(path.join(transcripts, 'existing.jsonl'), 'utf8')).toBe('history');
    });

    it.each(['9GClaw', '9GClaw2'])('migrates a registered %s location without copying its identity or changing the new cwd on restart', async name => {
        const root = await makeTemporaryRoot();
        const pilotHome = path.join(root, 'profile');
        const parent = path.join(root, 'workspaces');
        const legacy = path.join(parent, name);
        const current = path.join(parent, '9GClawGeneral');
        const workspaceId = 'previous-location-id';
        await fs.mkdir(legacy, { recursive: true });
        await fs.mkdir(pilotHome);
        await fs.writeFile(path.join(legacy, '.9gclaw-workspace'), JSON.stringify({ product: '9GClaw', version: 1, id: workspaceId }));
        await fs.writeFile(path.join(legacy, 'report.md'), 'old version');
        await fs.writeFile(path.join(pilotHome, 'general-workspace.json'), JSON.stringify({ version: 1, baseDirectory: path.join(parent, '9GClaw'), directory: legacy, workspaceId }));
        await fs.mkdir(current);
        await fs.writeFile(path.join(current, 'report.md'), 'current version');
        const env = { NINEGCLAW_HOME: pilotHome, WORKSPACES_ROOT: parent };
        expect(await ensureGeneralWorkspaceDirectory(env)).toBe(current);
        expect(await fs.readFile(path.join(current, 'report.md'), 'utf8')).toBe('current version');
        expect(await fs.readFile(path.join(current, 'report (from 9GClaw).md'), 'utf8')).toBe('old version');
        const marker = JSON.parse(await fs.readFile(path.join(current, '.9gclaw-workspace'), 'utf8'));
        expect(marker.id).not.toBe(workspaceId);
        const files = await fs.readdir(current);
        expect(files.some(file => file.includes('9gclaw-workspace (from'))).toBe(false);
        vi.resetModules();
        const restarted = await import('./generalWorkspace.js');
        expect(await restarted.ensureGeneralWorkspaceDirectory({ ...env })).toBe(current);
        expect(await fs.readdir(current)).toEqual(files);
    });

    it('does not import an unrelated 9GClaw folder or application installation on first launch', async () => {
        const root = await makeTemporaryRoot();
        const legacy = path.join(root, '9GClaw');
        await fs.mkdir(legacy);
        await fs.writeFile(path.join(legacy, 'app.exe'), 'application');
        const env = { NINEGCLAW_HOME: path.join(root, 'profile'), WORKSPACES_ROOT: root };
        const current = await ensureGeneralWorkspaceDirectory(env);
        expect(await fs.readdir(current)).toEqual(['.9gclaw-workspace']);
        const transcripts = path.join(env.NINEGCLAW_HOME, 'projects', createProjectId(env.NINEGCLAW_HOME), 'chats');
        await fs.mkdir(transcripts, { recursive: true });
        await fs.writeFile(path.join(transcripts, 'existing.jsonl'), 'history');
        expect(await ensureGeneralWorkspaceDirectory({ ...env, NINEGCLAW_DESKTOP_INSTALL_ROOT: legacy })).toBe(current);
        expect(await fs.readdir(current)).toEqual(['.9gclaw-workspace']);
        expect(await fs.readFile(path.join(legacy, 'app.exe'), 'utf8')).toBe('application');
    });
    it.each(['file', 'link'])('ignores an unrelated %s at the previous 9GClaw path on first launch', async kind => {
        const root = await makeTemporaryRoot();
        const previous = path.join(root, '9GClaw');
        if (kind === 'file') await fs.writeFile(previous, 'unrelated file');
        else {
            const other = path.join(root, 'other');
            await fs.mkdir(other);
            await fs.writeFile(path.join(other, 'private.txt'), 'must not import');
            await fs.symlink(other, previous, process.platform === 'win32' ? 'junction' : 'dir');
        }
        const directory = await ensureGeneralWorkspaceDirectory({ NINEGCLAW_HOME: path.join(root, 'profile'), WORKSPACES_ROOT: root });
        expect(directory).toBe(path.join(root, '9GClawGeneral'));
        expect(await fs.readdir(directory)).toEqual(['.9gclaw-workspace']);
    });

    it('merges a custom root with an already populated 9GClaw directory', async () => {
        const root = await makeTemporaryRoot();
        const workspacesRoot = path.join(root, 'custom');
        await fs.mkdir(path.join(workspacesRoot, 'general'), { recursive: true });
        await fs.mkdir(path.join(workspacesRoot, '9GClawGeneral'));
        await fs.writeFile(path.join(workspacesRoot, 'general', 'report.md'), 'legacy');
        await fs.writeFile(path.join(workspacesRoot, '9GClawGeneral', 'report.md'), 'current');
        const result = await ensureGeneralWorkspaceDirectory({ NINEGCLAW_HOME: path.join(root, 'profile'), WORKSPACES_ROOT: workspacesRoot });
        expect(result).toBe(path.join(workspacesRoot, '9GClawGeneral'));
        expect(await fs.readFile(path.join(result, 'report.md'), 'utf8')).toBe('current');
        expect(await fs.readFile(path.join(result, 'report (from general).md'), 'utf8')).toBe('legacy');
    });

    it.each(['darwin', 'linux'])('defaults to ~/9GClawGeneral on %s', (platform) => {
        const homeDirectory = path.resolve('fixture-user');
        expect(resolveGeneralWorkspaceDirectory({ NINEGCLAW_HOME: path.join(homeDirectory, '.9gclaw') }, {
            platform, homeDirectory,
        })).toBe(path.join(homeDirectory, '9GClawGeneral'));
    });

    it.each(['unset', 'tilde', 'absolute'])('uses the Windows Documents folder with the default project root %s', (rootKind) => {
        const homeDirectory = path.resolve('fixture-user');
        const documentsDirectory = path.resolve('redirected-documents');
        const workspacesRoot = rootKind === 'absolute' ? homeDirectory : rootKind === 'tilde' ? '~' : undefined;
        expect(resolveGeneralWorkspaceDirectory({ NINEGCLAW_HOME: path.join(homeDirectory, '.9gclaw'), WORKSPACES_ROOT: workspacesRoot }, {
            platform: 'win32', homeDirectory, documentsDirectory,
        })).toBe(path.join(documentsDirectory, '9GClawGeneral'));
    });

    it('resolves the Windows known Documents folder outside the desktop host', () => {
        const documentsDirectory = path.resolve('system-documents');
        systemFolders.query.mockReturnValue(documentsDirectory + '\r\n');
        expect(resolveGeneralWorkspaceDirectory({}, { platform: 'win32' })).toBe(path.join(documentsDirectory, '9GClawGeneral'));
        expect(systemFolders.query).toHaveBeenCalledWith('powershell.exe', expect.any(Array), expect.objectContaining({ windowsHide: true }));
    });

    it('falls back to ~/Documents if the Windows known-folder query is unavailable', async () => {
        vi.resetModules();
        systemFolders.query.mockImplementation(() => { throw new Error('PowerShell unavailable'); });
        const { resolveGeneralWorkspaceDirectory: resolveFresh } = await import('./generalWorkspace.js');
        const homeDirectory = path.resolve('fixture-user');
        expect(resolveFresh({}, { platform: 'win32', homeDirectory })).toBe(path.join(homeDirectory, 'Documents', '9GClawGeneral'));
    });

    it('creates a managed General directory under WORKSPACES_ROOT', async () => {
        const root = await makeTemporaryRoot();
        const pilotHome = path.join(root, 'pilot-home');
        const workspacesRoot = path.join(root, 'workspaces');
        await fs.mkdir(pilotHome);

        const actual = await ensureGeneralWorkspaceDirectory({
            NINEGCLAW_HOME: pilotHome,
            WORKSPACES_ROOT: workspacesRoot,
        });

        expect(actual).toBe(path.join(workspacesRoot, '9GClawGeneral'));
        expect((await fs.stat(actual)).isDirectory()).toBe(true);
    });

    it('reports a missing registered workspace instead of silently selecting a new directory', async () => {
        const root = await makeTemporaryRoot();
        const env = {
            NINEGCLAW_HOME: path.join(root, 'pilot-home'),
            WORKSPACES_ROOT: path.join(root, 'workspaces'),
        };
        await fs.mkdir(env.NINEGCLAW_HOME);
        const first = await ensureGeneralWorkspaceDirectory(env);
        await fs.rm(env.WORKSPACES_ROOT, { recursive: true, force: true });

        await expect(ensureGeneralWorkspaceDirectory(env)).rejects.toMatchObject({ code: 'GENERAL_WORKSPACE_STATE_INVALID' });
        expect(resolveGeneralWorkspaceDirectory(env)).toBe(first);
    });

    it('rejects workspace roots that would expose NINEGCLAW_HOME', () => {
        const pilotHome = '/tmp/9gclaw-home';
        expect(() => resolveGeneralWorkspaceDirectory({
            NINEGCLAW_HOME: pilotHome,
            WORKSPACES_ROOT: pilotHome,
        })).toThrow('separate from NINEGCLAW_HOME');
    });

    it('uses a numbered default instead of a symbolic-link General directory on first launch', async () => {
        const root = await makeTemporaryRoot();
        const pilotHome = path.join(root, 'pilot-home');
        const workspacesRoot = path.join(root, 'workspaces');
        const linkTarget = path.join(root, 'elsewhere');
        await Promise.all([
            fs.mkdir(pilotHome),
            fs.mkdir(workspacesRoot),
            fs.mkdir(linkTarget),
        ]);
        await fs.symlink(linkTarget, path.join(workspacesRoot, '9GClawGeneral'), process.platform === 'win32' ? 'junction' : 'dir');

        expect(await ensureGeneralWorkspaceDirectory({
            NINEGCLAW_HOME: pilotHome,
            WORKSPACES_ROOT: workspacesRoot,
        })).toBe(path.join(workspacesRoot, '9GClawGeneral2'));
        expect(await fs.readdir(linkTarget)).toEqual([]);
    });

    it('keeps an existing populated default on first install when the application is elsewhere', async () => {
        const root = await makeTemporaryRoot();
        const directory = path.join(root, 'workspaces', '9GClawGeneral');
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, 'report.md'), 'existing');
        const env = { NINEGCLAW_HOME: path.join(root, 'profile'), WORKSPACES_ROOT: path.join(root, 'workspaces') };
        expect(await ensureGeneralWorkspaceDirectory(env)).toBe(directory);
        expect(await fs.readFile(path.join(directory, 'report.md'), 'utf8')).toBe('existing');
        expect(await ensureGeneralWorkspaceDirectory(env)).toBe(directory);
    });

    it('skips an installation and occupied numbered folders, then preserves the selection across upgrades', async () => {
        const root = await makeTemporaryRoot();
        const workspaceRoot = path.join(root, 'workspaces');
        const installation = path.join(workspaceRoot, '9GClawGeneral', 'resources', 'runtime');
        await fs.mkdir(installation, { recursive: true });
        await fs.mkdir(path.join(workspaceRoot, '9GClawGeneral2'));
        await fs.writeFile(path.join(workspaceRoot, '9GClawGeneral2', '.hidden'), 'existing');
        const env = { NINEGCLAW_HOME: path.join(root, 'profile'), WORKSPACES_ROOT: workspaceRoot, NINEGCLAW_DESKTOP_RUNTIME_ROOT: installation };
        const directory = await ensureGeneralWorkspaceDirectory(env);
        expect(directory).toBe(path.join(workspaceRoot, '9GClawGeneral3'));
        await fs.writeFile(path.join(directory, 'report.md'), 'created by user');
        // A replacement installation changes the runtime contents, not profile identity.
        await fs.writeFile(path.join(installation, 'new-version.txt'), 'upgrade');
        vi.resetModules();
        const upgraded = await import('./generalWorkspace.js');
        expect(await upgraded.ensureGeneralWorkspaceDirectory({ ...env })).toBe(directory);
        expect(upgraded.resolveGeneralWorkspaceDirectory(env)).toBe(directory);
        expect(upgraded.generalWorkspaceNotice(env)).toEqual({ directory, originalDirectory: path.join(workspaceRoot, '9GClawGeneral') });
        expect(await fs.readFile(path.join(directory, 'report.md'), 'utf8')).toBe('created by user');
        expect(await fs.readdir(workspaceRoot)).not.toContain('9GClawGeneral4');
    });

    it('skips a file occupying the default path and serializes concurrent initialization', async () => {
        const root = await makeTemporaryRoot();
        await fs.mkdir(path.join(root, 'workspaces'));
        await fs.writeFile(path.join(root, 'workspaces', '9GClawGeneral'), 'unrelated file');
        const env = { NINEGCLAW_HOME: path.join(root, 'profile'), WORKSPACES_ROOT: path.join(root, 'workspaces') };
        const results = await Promise.all(Array.from({ length: 4 }, () => ensureGeneralWorkspaceDirectory(env)));
        expect(new Set(results)).toEqual(new Set([path.join(root, 'workspaces', '9GClawGeneral2')]));
        expect(await fs.readFile(path.join(root, 'workspaces', '9GClawGeneral'), 'utf8')).toBe('unrelated file');
    });

    it('fails closed if a registered workspace is replaced or its identity is damaged', async () => {
        const root = await makeTemporaryRoot();
        const env = { NINEGCLAW_HOME: path.join(root, 'profile'), WORKSPACES_ROOT: path.join(root, 'workspaces') };
        const directory = await ensureGeneralWorkspaceDirectory(env);
        await fs.writeFile(path.join(directory, '.9gclaw-workspace'), JSON.stringify({ product: '9GClaw', version: 1, id: 'another-directory' }));
        await expect(ensureGeneralWorkspaceDirectory(env)).rejects.toMatchObject({ code: 'GENERAL_WORKSPACE_STATE_INVALID' });
        expect(await fs.readdir(path.dirname(directory))).not.toContain('9GClawGeneral2');
    });
});
