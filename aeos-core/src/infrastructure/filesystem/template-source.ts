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
export function templatesRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', 'templates');
}

export interface TemplateFile {
  /** Path relative to the templates root, e.g. `agents/architect-agent.yaml`. */
  readonly relativePath: string;
  readonly content: string;
}

/** Opt-in pipeline presets live here; they are not part of the default scaffold. */
const PRESETS_DIR = 'presets';

function walk(dir: string, root: string, out: TemplateFile[], skipTop?: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (dir === root && entry.name === skipTop) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, root, out, skipTop);
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
  // The default scaffold is the standard pipeline; presets are overlaid on top
  // only when a project asks for one (see readPreset).
  walk(root, root, files, PRESETS_DIR);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * The scaffold file set for a pipeline choice. `standard` is the shipped
 * templates as-is. `manifesto` overlays the manifesto preset on them: its
 * `pipelines.yaml` replaces the standard one and its extra column specs, agents
 * and rubrics are added, so the normal skip-if-exists scaffolding both installs
 * the preset and never clobbers a user's later edits.
 */
export function templateSet(pipeline: 'standard' | 'manifesto'): TemplateFile[] {
  const base = readTemplates();
  if (pipeline === 'standard') return base;

  const byPath = new Map(base.map((file) => [file.relativePath, file.content]));
  for (const file of readPreset('manifesto')) byPath.set(file.relativePath, file.content);
  return [...byPath]
    .map(([relativePath, content]) => ({ relativePath, content }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * The files of an opt-in pipeline preset, with paths relative to the preset root
 * so they mirror the project's `.aeos/` (e.g. `pipelines.yaml`,
 * `column-specs/api-contract.yaml`). The preset's README is not a scaffold file
 * and is excluded. Throws when the named preset is missing — a packaging fault.
 */
export function readPreset(name: string): TemplateFile[] {
  const root = path.join(templatesRoot(), PRESETS_DIR, name);
  if (!fs.existsSync(root)) {
    throw new Error(
      `Pipeline preset '${name}' not found at ${root}. This is an AEOS packaging fault — reinstall, or run \`npm run build\` from source.`,
    );
  }
  const files: TemplateFile[] = [];
  walk(root, root, files);
  return files
    .filter((file) => file.relativePath !== 'README.md')
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
