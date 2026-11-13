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

export const SCRIPT_TAG = '<script type="module" src="./index.tsx"></script>';

/**
 * Inlines `bundledJs` into `template` in place of `scriptTag`.
 *
 * Two inlining hazards this guards against, both of which silently corrupt the
 * page and dump the script as visible text:
 *  - A `$` in the replacement is special to String.replace (`$&`, `$'`, `` $` ``,
 *    `$1`), and the bundle is full of `$` (`$typeof`, `error$0`, …). A function
 *    replacement is inserted verbatim, so none of it is interpreted.
 *  - The HTML parser ends a `<script>` at `</script` followed by `>`, `/`, or
 *    whitespace — not only the literal `</script>`. Escape every such form.
 */
export function inlineBundle(template, bundledJs, scriptTag = SCRIPT_TAG) {
  if (!template.includes(scriptTag)) {
    throw new Error(`index.html is missing the expected script tag: ${scriptTag}`);
  }
  const escaped = bundledJs.replace(/<\/(script)/gi, '<\\/$1');
  const inlined = `<script type="module">\n${escaped}\n</script>`;
  return template.replace(scriptTag, () => inlined);
}

async function main() {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const clientSrc = join(packageRoot, 'src', 'web', 'client');
  const outDir = join(packageRoot, 'dist', 'web', 'client');

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

  const template = readFileSync(join(clientSrc, 'index.html'), 'utf-8');
  const html = inlineBundle(template, result.outputFiles[0].text);
  writeFileSync(join(outDir, 'index.html'), html, 'utf-8');
}

// Run the build only when invoked directly, so importing the pure helper for
// tests does not trigger esbuild.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
