// Builds and uploads the offline province maps (OpenStreetMap by Protomaps) to R2 under maps/.
//   node scripts/offline-maps.mjs <pmtiles.exe> <work dir> [build date YYYYMMDD] [--local]
// Cuts each province from the daily Protomaps planet build with the official pmtiles tool
// (github.com/protomaps/go-pmtiles), then puts it in the ahbab-files bucket. Re-run it every
// few months to refresh the maps; delegates then download their province again.
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const PROVINCES = {
  baghdad: '43.95,32.95,44.75,33.75', karbala: '43.0,32.15,44.35,33.05', najaf: '42.3,29.9,44.7,32.3',
  babil: '44.0,32.1,45.2,33.1', basra: '46.6,29.6,48.6,31.3', wasit: '44.6,32.0,46.6,33.5',
  dhiqar: '45.5,30.5,47.2,32.2', maysan: '46.3,31.0,47.9,32.9', qadisiyah: '44.5,31.3,45.9,32.4',
  muthanna: '43.5,29.0,46.6,31.8', diyala: '44.3,33.3,46.2,35.1', salahaddin: '42.8,33.5,45.0,35.4',
  nineveh: '41.0,35.0,44.0,37.2', kirkuk: '43.4,34.9,44.9,35.9', anbar: '38.7,31.6,44.0,35.0',
  erbil: '43.4,35.6,45.0,37.1', sulaymaniyah: '44.6,34.5,46.4,36.5', duhok: '42.3,36.6,44.3,37.4',
};

const [tool, dir, build = '', ...flags] = process.argv.slice(2);
if (!tool || !dir || !/^\d{8}$/.test(build)) {
  console.error('usage: node scripts/offline-maps.mjs <pmtiles.exe> <work dir> <YYYYMMDD> [--local]');
  process.exit(1);
}
const local = flags.includes('--local');

for (const [slug, bbox] of Object.entries(PROVINCES)) {
  const file = join(dir, `${slug}.pmtiles`);
  if (!existsSync(file)) {
    console.log(`extract ${slug}…`);
    execFileSync(tool, ['extract', `https://build.protomaps.com/${build}.pmtiles`, file, `--bbox=${bbox}`, '--maxzoom=15', '--download-threads=8'], { stdio: 'ignore' });
  }
  const mb = (statSync(file).size / 1e6).toFixed(1);
  console.log(`upload ${slug} (${mb} MB)…`);
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `ahbab-files/maps/${slug}.pmtiles`, '--file', file,
    '--content-type', 'application/octet-stream', local ? '--local' : '--remote'],
  { stdio: 'inherit', shell: true });
}
console.log('done');
