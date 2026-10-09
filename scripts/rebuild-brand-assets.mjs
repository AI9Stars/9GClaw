/** Rebuild 九格智能体平台 branding from the exact supplied ui/public/logo-256.png. */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(new URL('../ui/public/logo-256.png', import.meta.url));
const png = (size) => sharp(source).resize(size, size, { fit: 'contain' }).png().toBuffer();
const write = (name, bytes) => writeFile(`${root}${name}`, bytes);
const embedded = `data:image/png;base64,${source.toString('base64')}`;
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><image width="256" height="256" href="${embedded}"/></svg>\n`;
for (const name of ['logo.svg', 'favicon.svg']) await write(`ui/public/${name}`, logoSvg);
await write('ui/public/logo-128.png', await png(128));
await write('ui/public/favicon.png', await png(64));
for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
  await write(`ui/public/icons/icon-${size}x${size}.png`, await png(size));
}
for (const name of ['9gclaw-p-mark-compact', '9gclaw-p-mark-transparent', '9gclaw-p-mark-transparent-v2']) {
  await write(`ui/public/${name}.png`, source);
}
for (const name of ['9gclaw-logo', '9gclaw-logo-white']) await write(`ui/src/assets/${name}.png`, source);
for (const [theme, color] of [['light', '#252238'], ['dark', '#f5f3ff']]) {
  const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" width="660" height="144"><image x="0" y="0" width="144" height="144" href="${embedded}"/><text x="166" y="96" font-family="PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-size="64" font-weight="700" fill="${color}">九格智能体平台</text></svg>`;
  const bytes = await sharp(Buffer.from(wordmark)).png().toBuffer();
  await write(`ui/src/assets/9gclaw-wordmark-${theme}.png`, bytes);
  if (theme === 'light') {
    await write('ui/public/9gclaw-logo-lockup-transparent.png', bytes);
    await write('assets/banner.png', bytes);
  }
}
await write('src/context/memory/edgeclaw-memory-core/ui-source/assets/brand/logo.png', source);
await write('apps/desktop/resources/icons/icon-source.png', source);
const traySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256"><defs><filter id="template"><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/></filter></defs><image width="256" height="256" href="${embedded}" filter="url(#template)"/></svg>\n`;
await write('apps/desktop/resources/icons/trayTemplate.svg', traySvg);
execFileSync(process.execPath, [`${root}apps/desktop/scripts/rebuild-tray-icon.mjs`], { stdio: 'inherit' });
execFileSync(process.execPath, [`${root}apps/desktop/scripts/rebuild-icon.mjs`], { stdio: 'inherit' });
// PNG-backed ICNS entries work on macOS and can be generated on any build host.
const chunks = [];
for (const [type, size] of [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]]) {
  const data = await png(size);
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'ascii');
  header.writeUInt32BE(data.length + 8, 4);
  chunks.push(header, data);
}
const header = Buffer.alloc(8);
header.write('icns');
header.writeUInt32BE(8 + chunks.reduce((sum, part) => sum + part.length, 0), 4);
await write('apps/desktop/resources/icons/icon.icns', Buffer.concat([header, ...chunks]));
console.log('Rebuilt all 九格智能体平台 web, PWA, memory and desktop brand assets.');
