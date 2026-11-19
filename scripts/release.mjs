// The one way to publish: `npm run release`.
// The same steps as the GitHub workflow (.github/workflows/deploy.yml), run from this machine
// while GitHub Actions is unavailable. It stops at the first failure, so a broken build or a
// failed migration never reaches the live site.
//   1. refuse unless on main with nothing uncommitted (what goes live is exactly a commit)
//   2. type-check the server and the app
//   3. build the app
//   4. apply database migrations (they only ever add, so the old code keeps working meanwhile)
//   5. deploy to Cloudflare
//   6. push main to GitHub, so GitHub always matches what is live
import { execSync } from 'node:child_process';

const run = (label, command) => {
  console.log(`\n▶ ${label}`);
  execSync(command, { stdio: 'inherit', env: { ...process.env, CI: 'true' } });
};
const read = (command) => execSync(command, { encoding: 'utf8' }).trim();

const branch = read('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') throw new Error(`Release from main only (now on ${branch}).`);
const dirty = read('git status --porcelain --untracked-files=no');
if (dirty) throw new Error(`Commit or discard these changes first:\n${dirty}`);

run('Type check', 'npm run typecheck');
run('Build', 'npm run build');
run('Database migrations', 'npx wrangler d1 migrations apply ahbab-db --remote');
run('Deploy to Cloudflare', 'npx wrangler deploy');
run('Push to GitHub', 'git push origin main');

console.log(`\n✔ Released ${read('git rev-parse --short HEAD')} to Cloudflare and GitHub.`);
