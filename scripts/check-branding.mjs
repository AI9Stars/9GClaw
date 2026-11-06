import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse } = require('yaml');
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const app = json('apps/desktop/package.json');
assert.equal(json('package.json').name, '9gclaw');
assert.equal(json('ui/package.json').name, '9gclaw-ui');
assert.equal(json('packages/config/package.json').name, '@9gclaw/config');
assert.equal(app.name, '9gclaw-desktop');
assert.equal(app.productName, '九格智能体平台');
assert.equal(app.build.productName, '九格智能体平台');
assert.equal(app.build.executableName, '9GClaw');
assert.equal(app.build.appId, 'cn.9gclaw.desktop');
assert.equal(app.build.publish.url, 'https://github.com/AI9Stars/9GClaw/releases/latest/download');
for (const filename of [app.build.executableName, app.build.artifactName, app.build.nsis.artifactName, app.build.portable.artifactName]) {
  assert.match(filename, /^[\x20-\x7e]+$/, 'Generated application filenames must be ASCII');
}
const logoHash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(logoHash('ui/public/logo-256.png'), '36c58fcbe68e6c7231358bed117acacbe37e5e76da791dd60c577ac93ed27a4b');
assert.equal(logoHash('scripts/computer-use/icon.png'), logoHash('ui/public/logo-256.png'));
assert.equal(logoHash('ui/public/9gclaw-icon-128.png'), logoHash('ui/public/icons/icon-128x128.png'));
assert.match(fs.readFileSync('ui/index.html', 'utf8'), /href="\/9gclaw-icon-128\.png\?v=jiuge2"/);
const workflowNames = fs.readdirSync('.github/workflows').filter(name => name.endsWith('.yml')).sort();
assert.deepEqual(workflowNames, ['desktop-smoke.yml', 'desktop-windows.yml', 'release-retry.yml', 'release.yml']);
const checks = parse(fs.readFileSync('.github/workflows/desktop-smoke.yml', 'utf8'));
for (const job of Object.values(checks.jobs)) {
  if (job.uses) assert.equal(job.uses, './.github/workflows/desktop-windows.yml');
  else assert.equal(job['runs-on'], 'windows-latest');
}
assert.equal(app.build.win.signExecutable, false);
assert.equal(app.build.win.verifyUpdateCodeSignature, false);
for (const platform of ['mac', 'linux', 'deb', 'rpm']) assert.equal(app.build[platform], undefined);
// Branding substitutions must never modify public API identifiers.
for (const folder of ['apps/desktop/src', 'apps/desktop/scripts']) {
  for (const file of fs.readdirSync(folder)) {
    if (!/\.(?:ts|cjs|mjs)$/.test(file)) continue;
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(folder, file), 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isIdentifier(node)) assert.ok(!node.text.includes(app.productName), `Brand name inside code identifier: ${file}: ${node.text}`);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
const release = parse(fs.readFileSync('.github/workflows/release.yml', 'utf8'));
assert.deepEqual(Object.keys(release.on), ['workflow_dispatch']);
assert.deepEqual(Object.keys(release.jobs), ['detect', 'windows', 'release']);

// Run the namespace audit in CI as well as local upstream-sync worktrees.
let upstream;
try { upstream = execFileSync('git', ['remote', 'get-url', 'upstream'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
{
  const previousName = upstream
    ? path.posix.basename(upstream).replace(/\.git$/, '').toLowerCase()
    : 'PilotDeck'.toLowerCase();
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0');
  for (const file of files) {
    if (!file || !fs.existsSync(file)) continue;
    assert.ok(!file.toLowerCase().includes(previousName), `Previous namespace in filename: ${file}`);
    const bytes = fs.readFileSync(file), text = bytes.toString('utf8');
    if (file.endsWith('.css')) assert.doesNotMatch(text, /[.#]9gclaw[\w-]*/, `CSS identifiers need a letter prefix: ${file}`);
    if (!bytes.includes(0) && Buffer.from(text).equals(bytes) && file !== 'scripts/check-branding.mjs') {
      assert.ok(!text.toLowerCase().includes(previousName), `Previous namespace in text: ${file}`);
    }
  }
}
console.log('Branding, ASCII artifact paths and Windows-only workflows verified.');
