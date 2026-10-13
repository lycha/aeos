// Infrastructure — locates and reads the shipped project templates.
//
// `templates/` lives at the package root as plain YAML and Markdown rather than
// as embedded string constants. The agent specs alone run to ~1000 lines; as TS
// literals they would be unreviewable and undiffable, and they are content a
// user is expected to edit after scaffolding.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Package root is three levels up from this module, and that holds for both
 * `src/infrastructure/filesystem/` and the compiled `dist/infrastructure/filesystem/`.
 */
function templatesRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', 'templates');
}

export interface TemplateFile {
  /** Path relative to the templates root, e.g. `agents/pm-agent.yaml`. */
  readonly relativePath: string;
  readonly content: string;
}

function walk(dir: string, root: string, out: TemplateFile[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, root, out);
    } else if (entry.isFile()) {
      out.push({
        relativePath: path.relative(root, absolute),
        content: fs.readFileSync(absolute, 'utf-8'),
      });
    }
  }
}

/**
 * Returns every shipped template file.
 *
 * Throws when the directory is missing — a build or packaging fault that must
 * be loud, because the alternative is scaffolding an empty project that fails
 * on its first `ticket run`.
 */
export function readTemplates(): TemplateFile[] {
  const root = templatesRoot();
  if (!fs.existsSync(root)) {
    throw new Error(
      `Project templates not found at ${root}. This is an AEOS packaging fault — reinstall, or run \`npm run build\` from source.`,
    );
  }

  const files: TemplateFile[] = [];
  walk(root, root, files);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
