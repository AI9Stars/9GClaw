import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import ts from 'typescript';

test('namespace sync preserves valid code/CSS identifiers, wire keys, binary bytes and dry-run safety', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '9gclaw-rebrand-'));
  const script = path.join(import.meta.dirname, 'rebrand-tracked-files.mjs');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const run = (...args) => execFileSync(process.execPath, [script, '--from', 'LegacyDeck', ...args], { cwd: root, encoding: 'utf8' });
  try {
    git('init', '--quiet');
    const original = `export class LegacyDeckRuntime {}
export const legacydeckDesktop = {};
export const providers = { legacydeck: true };
export const style = 'legacydeck-widget legacydeck-docx-wrapper';
export const renderOptions = { className: 'legacydeck-docx' };
export const directory = 'LegacyDeckGeneral';
export const uppercaseDirectory = '.LEGACYDECK';
export const setting = process.env.LEGACYDECK_CONFIG_PATH;
`;
    const bytes = Buffer.from([0, 255, 12, 13, 128]);
    fs.writeFileSync(path.join(root, 'legacydeck.ts'), original);
    fs.writeFileSync(path.join(root, 'style.css'), '.legacydeck-widget { color: red }');
    fs.writeFileSync(path.join(root, 'legacydeck-logo.png'), bytes);
    git('add', '-A');
    assert.match(run(), /Would rebrand 3 tracked files/);
    assert.equal(fs.readFileSync(path.join(root, 'legacydeck.ts'), 'utf8'), original);
    run('--apply');
    assert.equal(fs.existsSync(path.join(root, 'legacydeck.ts')), false);
    const code = fs.readFileSync(path.join(root, '9gclaw.ts'), 'utf8');
    assert.match(code, /class NineGClawRuntime/);
    assert.match(code, /const ninegclawDesktop/);
    assert.match(code, /"9gclaw": true/);
    assert.match(code, /ninegclaw-widget ninegclaw-docx-wrapper/);
    assert.match(code, /'9GClawGeneral'/);
    assert.match(code, /'\.9GCLAW'/);
    assert.match(code, /env\.NINEGCLAW_CONFIG_PATH/);
    assert.equal(ts.createSourceFile('9gclaw.ts', code, ts.ScriptTarget.Latest).parseDiagnostics.length, 0);
    assert.equal(fs.readFileSync(path.join(root, 'style.css'), 'utf8'), '.ninegclaw-widget { color: red }');
    assert.deepEqual(fs.readFileSync(path.join(root, '9gclaw-logo.png')), bytes);
    git('add', '-A');
    assert.match(run(), /Would rebrand 0 tracked files/);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
