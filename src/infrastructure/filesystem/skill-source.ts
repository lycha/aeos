// Infrastructure — locates the shipped `aeos` agent skill and links it into
// each executor's skill directory.
//
// The skill teaches an agent to drive the aeos CLI (creating child tasks during
// decomposition, chiefly). One canonical copy lives in the project under
// .aeos/skills/, and each agentic executor's own skills directory links to it,
// so a single definition serves whichever backend runs — the executor
// abstraction stays intact.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const AEOS_DIR = '.aeos';
const SKILLS_SUBDIR = 'skills';
const SKILL_NAME = 'aeos';

/**
 * Executor skill directories the skill is linked into, relative to the project
 * root. This is *reinforcement*, not the load-bearing path: the decomposition
 * instruction lives in the architect agent's taskInstruction, which reaches
 * every executor through the prompt (see templates/agents/architect-agent.yaml).
 * So a backend absent from this list — opencode-cli, or ollama-cli, which is
 * artifact-only anyway — still gets the instruction and is not silently broken;
 * it just lacks the skill's extra reference. Claude Code reads `.claude/skills`,
 * Augment/auggie reads `.augment/skills`. Extend as other backends gain a
 * skills mechanism.
 */
const EXECUTOR_SKILL_DIRS = ['.claude/skills', '.augment/skills'] as const;

/** Package root is three levels up from this module, in both src/ and dist/. */
function packagedSkillDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(here, '..', '..', '..', SKILLS_SUBDIR, SKILL_NAME);
  // Fail loudly on a packaging fault, as template-source does — otherwise the
  // copy below throws a cryptic ENOENT after templates are already written,
  // leaving a half-scaffolded project.
  if (!fs.existsSync(dir)) {
    throw new Error(
      `aeos skill not found at ${dir}. This is an AEOS packaging fault — reinstall, or run \`npm run build\` from source.`,
    );
  }
  return dir;
}

function copyDir(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else if (entry.isFile()) fs.copyFileSync(src, dst);
  }
}

/**
 * Links a target directory to the canonical skill via a relative symlink,
 * falling back to a copy where symlinks are unavailable (e.g. Windows without
 * privilege). Skips a target that already points somewhere.
 */
function linkOrCopy(canonical: string, target: string): boolean {
  if (fs.existsSync(target) || isSymlink(target)) return false;

  fs.mkdirSync(path.dirname(target), { recursive: true });
  const relative = path.relative(path.dirname(target), canonical);
  try {
    fs.symlinkSync(relative, target, 'dir');
  } catch {
    copyDir(canonical, target);
  }
  return true;
}

function isSymlink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Scaffolds the aeos skill into a project and links it into each executor's
 * skills directory. Idempotent: never overwrites an existing canonical copy or
 * an existing executor link. Returns the paths it created, relative to root.
 */
export function scaffoldSkill(projectRoot: string): string[] {
  const created: string[] = [];
  const canonical = path.join(projectRoot, AEOS_DIR, SKILLS_SUBDIR, SKILL_NAME);

  if (!fs.existsSync(canonical)) {
    copyDir(packagedSkillDir(), canonical);
    created.push(path.join(AEOS_DIR, SKILLS_SUBDIR, SKILL_NAME));
  }

  for (const dir of EXECUTOR_SKILL_DIRS) {
    const target = path.join(projectRoot, dir, SKILL_NAME);
    if (linkOrCopy(canonical, target)) {
      created.push(path.join(dir, SKILL_NAME));
    }
  }

  return created;
}
