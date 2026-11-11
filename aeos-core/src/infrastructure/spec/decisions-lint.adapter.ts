// Adapter — DecisionsLint through the seeded `lint_decisions.py`.
//
// The linter does the JSON Schema pass as well (python module `jsonschema`),
// so the engine needs no schema validator of its own.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';

import type {
  DecisionsLint,
  DecisionsLintResult,
} from '../../domain/ports/driven/decisions-lint.port.js';

export interface PythonRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** True when `python3` could not be started at all. */
  readonly notFound: boolean;
}

export type PythonRunner = (args: string[], cwd: string) => PythonRun;

const spawn: PythonRunner = (args, cwd) => {
  const result = spawnSync('python3', args, { cwd, encoding: 'utf-8' });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    notFound: result.error !== undefined,
  };
};

const REQUIRED_FILES = ['spec.md', 'decisions.yaml'];
const LINTER = path.join('schemas', 'lint_decisions.py');
const ERROR_PREFIX = ' ERROR: ';
/** The three lists of decisions.yaml and the field that names each entry. */
const RESOLUTION_LISTS = [
  ['conflict_resolutions', 'conflict'],
  ['decisions', 'absence'],
  ['question_resolutions', 'question'],
] as const;

export class PythonDecisionsLint implements DecisionsLint {
  /** The runner is replaceable so tests need no `python3`. */
  constructor(private readonly run: PythonRunner = spawn) {}

  missingFiles(featureDir: string): string[] {
    return REQUIRED_FILES.filter((file) => !fs.existsSync(path.join(featureDir, file)));
  }

  lint(treeRoot: string, feature: string): DecisionsLintResult {
    if (!fs.existsSync(path.join(treeRoot, LINTER))) {
      throw new Error(
        `${path.join(treeRoot, LINTER)} is missing. Run \`aeos project sync --apply\` to restore the schemas.`,
      );
    }
    // Without these the linter skips the schema pass or cannot read YAML, and
    // either would let an invalid decisions.yaml through.
    const modules = this.run(['-c', 'import yaml, jsonschema'], treeRoot);
    if (modules.notFound) {
      throw new Error(
        'python3 is not on PATH. It is needed to run lint_decisions.py; install Python 3.',
      );
    }
    if (modules.status !== 0) {
      throw new Error(
        'The python3 modules PyYAML and jsonschema are needed to run lint_decisions.py. Install them with `python3 -m pip install pyyaml jsonschema`.',
      );
    }

    const featurePath = path.join('features', feature);
    const linted = this.run(
      [LINTER, featurePath, '--register', 'assumption-register.yaml', '--schemas', 'schemas'],
      treeRoot,
    );
    const errors = linted.stdout
      .split('\n')
      .filter((line) => line.startsWith(ERROR_PREFIX))
      .map((line) => line.slice(ERROR_PREFIX.length));
    if (linted.status !== 0 && errors.length === 0) {
      errors.push(linted.stderr.trim() || `lint_decisions.py exited ${linted.status}`);
    }
    const isSchemaError = (error: string): boolean => /^[\w-]+\.schema\.json: /.test(error);

    return {
      schemaErrors: errors.filter(isSchemaError),
      lintErrors: errors.filter((error) => !isSchemaError(error)),
      escalated: this.escalated(path.join(treeRoot, featurePath, 'decisions.yaml')),
    };
  }

  private escalated(decisionsPath: string): string[] {
    let decisions: unknown;
    try {
      decisions = yaml.load(fs.readFileSync(decisionsPath, 'utf-8'));
    } catch {
      return []; // unreadable: the linter has already reported it
    }
    if (typeof decisions !== 'object' || decisions === null) return [];
    const lists = decisions as Record<string, unknown>;
    return RESOLUTION_LISTS.flatMap(([list, idField]) => {
      const entries = Array.isArray(lists[list]) ? (lists[list] as unknown[]) : [];
      return entries
        .filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === 'object' &&
            entry !== null &&
            (entry as Record<string, unknown>).outcome === 'ESCALATED',
        )
        .map((entry) => String(entry[idField]));
    });
  }
}
