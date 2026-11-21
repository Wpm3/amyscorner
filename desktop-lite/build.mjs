// Builds the lightweight Windows app (~6 MB) on top of the system WebView2:
//   1. copies the Expo web export (../dist) into ./app
//   2. packs it into a single Unfold-win_x64.exe with Neutralinojs
//   3. stamps the Unfold icon and version info into the .exe (pure JS, no Wine)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as PE from 'pe-library';
import * as ResEdit from 'resedit';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dist = path.join(root, 'dist');
const app = path.join(here, 'app');
const cfg = JSON.parse(fs.readFileSync(path.join(here, 'neutralino.config.json'), 'utf8'));

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html missing: run `npx expo export --platform web` in the project root first.');
  process.exit(1);
}
fs.rmSync(app, { recursive: true, force: true });
fs.cpSync(dist, app, { recursive: true });
fs.copyFileSync(path.join(root, 'desktop', 'build', 'icon.png'), path.join(app, 'icon.png'));

// Neutralino's static server has no SPA fallback, so a reload on /reader/<id>
// would 404. Send reloads back to the library instead.
const indexPath = path.join(app, 'index.html');
const guard = `<script>(function(){addEventListener('keydown',function(e){if(e.key==='F5'||((e.ctrlKey||e.metaKey)&&(e.key==='r'||e.key==='R'))){e.preventDefault();if(location.pathname!=='/')location.replace('/');}},true);})();</script>`;
fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8').replace('<head>', `<head>${guard}`));

if (!fs.existsSync(path.join(here, 'bin', 'neutralino-win_x64.exe'))) execSync('npx neu update', { cwd: here, stdio: 'inherit' });
fs.rmSync(path.join(here, 'dist'), { recursive: true, force: true });
execSync('npx neu build --release --embed-resources', { cwd: here, stdio: 'inherit' });

const outDir = path.join(here, 'dist', cfg.cli.binaryName);
const exePath = path.join(outDir, `${cfg.cli.binaryName}-win_x64.exe`);
const exe = PE.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = PE.NtExecutableResource.from(exe);
const icon = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root, 'desktop', 'build', 'icon.ico')));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const groupId = groups.length ? groups[0].id : 1;
const lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, icon.icons.map((i) => i.data));
const [major, minor, patch] = cfg.version.split('.').map(Number);
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] ?? ResEdit.Resource.VersionInfo.createEmpty();
vi.setFileVersion(major, minor, patch, 0, 1033);
vi.setProductVersion(major, minor, patch, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  ProductName: 'Unfold',
  FileDescription: 'Unfold - sentence-by-sentence reader',
  CompanyName: 'amyscorner',
  OriginalFilename: 'Unfold.exe',
  InternalName: 'Unfold',
});
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
const finalExe = path.join(outDir, 'Unfold.exe');
fs.writeFileSync(finalExe, Buffer.from(exe.generate()));
fs.rmSync(exePath);
for (const f of fs.readdirSync(outDir)) if (f !== 'Unfold.exe' && !f.startsWith('resources')) fs.rmSync(path.join(outDir, f), { force: true });
console.log('Built', path.relative(root, finalExe), (fs.statSync(finalExe).size / 1048576).toFixed(1), 'MB');
console.log(fs.readdirSync(outDir));
