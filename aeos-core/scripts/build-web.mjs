// Bundles the SPA (src/web/client/) into dist/web/client/index.html for
// static.ts to serve (tech spec §6/§8 step 18). The bundled JS is inlined
// into the one HTML document rather than written as a separate file: the
// server's route table (src/web/server.ts, T-010) only ever forwards `GET /`
// to serveStatic — every other path falls to the generic auth-required
// fallback and 404s — so a separate `<script src="...">` request could never
// be fetched. A single self-contained document is the shape this server can
// actually serve; one-shot build, no watch/HMR needed for it.

import * as esbuild from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const clientSrc = join(packageRoot, 'src', 'web', 'client');
const outDir = join(packageRoot, 'dist', 'web', 'client');

const SCRIPT_TAG = '<script type="module" src="./index.tsx"></script>';

mkdirSync(outDir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [join(clientSrc, 'index.tsx')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  sourcemap: 'inline',
  jsx: 'automatic',
});

const bundledJs = result.outputFiles[0].text.replace(/<\/script>/gi, '<\\/script>');
const template = readFileSync(join(clientSrc, 'index.html'), 'utf-8');
if (!template.includes(SCRIPT_TAG)) {
  throw new Error(`index.html is missing the expected script tag: ${SCRIPT_TAG}`);
}
const html = template.replace(SCRIPT_TAG, `<script type="module">\n${bundledJs}\n</script>`);

writeFileSync(join(outDir, 'index.html'), html, 'utf-8');
