// Reapply the fork's mechanical namespace changes after syncing upstream.
// Only tracked UTF-8 text and tracked filenames are changed; media stays intact.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const args = process.argv.slice(2);
const source = args.includes('--from') ? args[args.indexOf('--from') + 1]
  : path.posix.basename(git('remote', 'get-url', 'upstream')).replace(/\.git$/, '');
if (!source || source.toLowerCase() === '9gclaw' || !/^[a-z][a-z0-9]*$/i.test(source)) {
  throw new Error('Provide an upstream brand using --from <name>, or configure the upstream remote.');
}
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lower = source.toLowerCase(), upper = source.toUpperCase();
const camel = source[0].toLowerCase() + source.slice(1);
const forms = new RegExp([source, camel, lower, upper].map(escape).sort((a, b) => b.length - a.length).join('|'), 'g');
const identifier = value => value.replace(forms, match => match === upper ? 'NINEGCLAW'
  : match === lower ? 'ninegclaw' : match === camel ? 'nineGClaw' : 'NineGClaw');
const plain = value => value
  .replace(new RegExp(`${escape(upper)}(?=_)`, 'g'), 'NINEGCLAW')
  .replaceAll(upper, '9GCLAW')
  .replaceAll(`${source}General`, '9GClawGeneral')
  .replace(new RegExp(`${escape(source)}(?=[A-Za-z])`, 'g'), 'NineGClaw')
  .replaceAll(camel, 'nineGClaw')
  .replace(new RegExp(`${escape(lower)}(?=[A-Z_])`, 'g'), 'ninegclaw')
  .replaceAll(source, '9GClaw').replaceAll(lower, '9gclaw')
  .replace(new RegExp(escape(source), 'gi'), '9gclaw')
  .replaceAll('PILOT_HOME', 'NINEGCLAW_HOME');
const references = value => value
  .replace(new RegExp(`https://github\\.com/(?:OpenBMB|mssssss123)/${escape(source)}/actions/runs/\\d+`, 'gi'), 'https://github.com/AI9Stars/9GClaw/actions')
  .replace(new RegExp(`https://github\\.com/mssssss123/${escape(source)}/tree/feat/9gclaw`, 'gi'), 'https://github.com/AI9Stars/9GClaw/blob/main/ui/public/logo-256.png')
  .replace(new RegExp(`OpenBMB/${escape(source)}`, 'gi'), 'AI9Stars/9GClaw')
  .replaceAll('OpenBMB/九格智能体平台', 'AI9Stars/9GClaw')
  .replace(new RegExp(`https?://${escape(lower)}\\.openbmb\\.cn(?:/[a-zA-Z0-9_./-]*)?`, 'g'), 'https://github.com/AI9Stars/9GClaw')
  .replace(new RegExp(`https://github\\.com/${escape(lower)}\\b`, 'g'), 'https://github.com/AI9Stars');

const root = git('rev-parse', '--show-toplevel');
process.chdir(root);
const trackedFiles = git('ls-files', '-z').split('\0');
// CSS identifiers need a letter prefix too. Include renderer-generated classes
// (such as docx-preview's className option), then update their selectors/usages.
const cssNames = new Set();
const cssPattern = new RegExp(`\\.(${escape(lower)}[\\w-]+)`, 'g');
const classNamePattern = new RegExp(`className\\s*[:=]\\s*["'](${escape(lower)}[\\w-]+)`, 'g');
for (const file of trackedFiles) {
  if (!/\.(?:css|[cm]?[jt]sx?)$/.test(file) || !fs.existsSync(file)) continue;
  // A JavaScript property such as process.env.LEGACYDECK_HOME is not a CSS
  // selector. Only scan dot selectors in CSS; inspect className in code.
  const pattern = file.endsWith('.css') ? cssPattern : classNamePattern;
  for (const match of fs.readFileSync(file, 'utf8').matchAll(pattern)) cssNames.add(match[1]);
}
const rewriteCss = value => [...cssNames].sort((a, b) => b.length - a.length)
  .reduce((text, name) => text.replaceAll(name, 'ninegclaw' + name.slice(source.length)), value);
const apply = args.includes('--apply');
let count = 0;
for (const file of trackedFiles) {
  // The audit intentionally names the upstream namespace it rejects.
  if (file === 'scripts/rebrand-tracked-files.mjs' || file === 'scripts/check-branding.mjs') continue;
  if (!file || !fs.existsSync(file)) continue;
  const bytes = fs.readFileSync(file);
  const original = bytes.toString('utf8');
  let next = original;
  if (!bytes.includes(0) && Buffer.from(original).equals(bytes)) {
    if (/\.[cm]?[jt]sx?$/.test(file)) {
      const parsed = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true);
      const edits = [];
      const visit = node => {
        if (ts.isIdentifier(node)) {
          const before = node.getText(parsed), after = identifier(before);
          if (after !== before) {
            const parent = node.parent;
            if (before === lower && ts.isPropertyAssignment(parent) && parent.name === node) {
              edits.push([node.getStart(parsed), node.end, JSON.stringify('9gclaw')]);
            } else if (before === lower && ts.isShorthandPropertyAssignment(parent)) {
              edits.push([node.getStart(parsed), node.end, `${JSON.stringify('9gclaw')}: ${after}`]);
            } else if (before === lower && ts.isPropertyAccessExpression(parent) && parent.name === node) {
              edits.push([parent.expression.end, node.end, `[${JSON.stringify('9gclaw')}]`]);
            } else edits.push([node.getStart(parsed), node.end, after]);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(parsed);
      for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) next = next.slice(0, start) + replacement + next.slice(end);
    }
    next = plain(references(rewriteCss(next)));
  }
  const renamed = plain(file);
  if (next === original && renamed === file) continue;
  count++;
  if (apply) {
    const destination = path.resolve(renamed);
    if (!destination.startsWith(path.resolve(root) + path.sep)) throw new Error(`Unexpected destination: ${renamed}`);
    if (next !== original) fs.writeFileSync(file, next);
    if (renamed !== file) {
      if (fs.existsSync(destination)) throw new Error(`Destination already exists: ${renamed}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.renameSync(file, destination);
    }
  }
}
console.log(`${apply ? 'Rebranded' : 'Would rebrand'} ${count} tracked files.`);
