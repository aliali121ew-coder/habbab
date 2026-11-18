import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const outDir = resolve(import.meta.dirname, '../dist');

// `wrangler dev` serves dist/ while it runs. Emptying the folder at the start of a build let it
// reload an empty asset list and answer 404 for every page until restarted, so the build writes
// over the old files in place and only then removes the hashed assets the new bundle no longer uses.
function pruneStaleAssets(): Plugin {
  return {
    name: 'prune-stale-assets',
    apply: 'build',
    writeBundle(_options, bundle) {
      const assets = resolve(outDir, 'assets');
      if (!existsSync(assets)) return;
      const keep = new Set(Object.keys(bundle).map((file) => resolve(outDir, file)));
      for (const name of readdirSync(assets)) {
        const path = resolve(assets, name);
        if (!keep.has(path)) rmSync(path, { force: true });
      }
    },
  };
}

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [react(), tailwindcss(), pruneStaleAssets()],
  build: {
    outDir,
    emptyOutDir: false,
    // Inlined fonts would be data: URLs, which the Content-Security-Policy blocks.
    assetsInlineLimit: 0,
  },
});
