// End-to-end harness — drives the real CLI against a throwaway project with
// AEOS_EXECUTOR=stub. Later tasks extend this file rather than writing their
// own scaffolding.

import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { vi } from 'vitest';

import { createContainer, runCli as runAeos } from '../cli/index.js';
import type { Column } from '../domain/model/column.js';
import type { SubStateOrNull } from '../domain/model/sub-state.js';
import { StubExecutor } from '../infrastructure/executor/stub-executor.adapter.js';
import { PythonDecisionsLint } from '../infrastructure/spec/decisions-lint.adapter.js';
import { resetDb } from '../infrastructure/persistence/database.js';

/** `ticket create --spec` runs lint_decisions.py, which needs python3 with PyYAML and jsonschema. */
export const pythonReady =
  spawnSync('python3', ['-c', 'import yaml, jsonschema'], { stdio: 'ignore' }).status === 0;
// Captured at load: the harness moves HOME, and with it python's per-user packages.
const pythonUserSite = spawnSync('python3', ['-m', 'site', '--user-site'], {
  encoding: 'utf-8',
}).stdout?.trim();

let workerTouch: string | null = null;

/**
 * From now until the project is cleaned up, every stub worker run also edits
 * this file, as an agent straying outside its task would. A relative path
 * resolves against the run's working directory. `null` stops it.
 */
export function stubWorkerTouches(file: string | null): void {
  workerTouch = file;
}

export interface TempProject {
  /** A git repository with one commit; `process.cwd()` reports this path. */
  readonly projectPath: string;
  /** The temporary `AEOS_HOME` (config, registry, state.db). */
  readonly aeosHome: string;
  /** Closes the database, restores env and mocks, deletes the directories. */
  cleanup(): void;
}

export interface CliResult {
  /** Everything the command printed to stdout and stderr. */
  readonly output: string;
  /** What it printed to stdout alone: under --json, one envelope. */
  readonly stdout: string;
  readonly exitCode: number;
}

/**
 * Creates a temporary home and project and points the process at them.
 *
 * HOME and the git config variables are redirected as well as AEOS_HOME:
 * `aeos install` writes the user's global git config and global gitignore,
 * which would otherwise be the real ones.
 *
 * Repo-change hook: the stub executor writes only its artifact, but an agentic
 * IMPLEMENTATION run must leave a real git diff. Rather than weaken that
 * guarantee, the stub is wrapped here so every IMPLEMENTATION run also writes
 * `stub-<ticketId>.txt` into its working directory, as a real engineer agent
 * would edit the repository. (On the bug track the stub edits it itself.)
 */
export function createTempProject(): TempProject {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-e2e-')));
  const home = path.join(root, 'home');
  const aeosHome = path.join(home, '.aeos');
  const projectPath = path.join(root, 'project');
  fs.mkdirSync(home);
  fs.mkdirSync(projectPath);

  resetDb();
  vi.stubEnv('HOME', home);
  vi.stubEnv('AEOS_HOME', aeosHome);
  vi.stubEnv('AEOS_EXECUTOR', 'stub');
  vi.stubEnv('GIT_CONFIG_GLOBAL', path.join(home, '.gitconfig'));
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  vi.stubEnv('GIT_AUTHOR_NAME', 'AEOS E2E');
  vi.stubEnv('GIT_AUTHOR_EMAIL', 'e2e@aeos.invalid');
  vi.stubEnv('GIT_COMMITTER_NAME', 'AEOS E2E');
  vi.stubEnv('GIT_COMMITTER_EMAIL', 'e2e@aeos.invalid');
  vi.spyOn(process, 'cwd').mockReturnValue(projectPath);
  if (pythonUserSite) vi.stubEnv('PYTHONPATH', pythonUserSite);
  // shortcut: every epic needs a spec, so without python the lint is answered
  // clean here and the pipeline cases still run; a case that tests the lint
  // itself must be skipped on `pythonReady` instead.
  if (!pythonReady) {
    vi.spyOn(PythonDecisionsLint.prototype, 'ready').mockReturnValue(true);
    vi.spyOn(PythonDecisionsLint.prototype, 'lint').mockReturnValue({
      schemaErrors: [],
      lintErrors: [],
      escalated: [],
    });
  }

  const stubRun = StubExecutor.prototype.run;
  vi.spyOn(StubExecutor.prototype, 'run').mockImplementation(async function (
    this: StubExecutor,
    invocation,
  ) {
    // A bug's two phases are the stub's own to play: it writes the test, then the fix.
    if (
      invocation.column === 'IMPLEMENTATION' &&
      invocation.workingDirectory &&
      !invocation.bugPhase
    ) {
      fs.writeFileSync(
        path.join(invocation.workingDirectory, `stub-${invocation.ticketId}.txt`),
        'stub change\n',
        'utf-8',
      );
    }
    const result = await stubRun.call(this, invocation);
    // The stub's own output says which role it played: preflight answers
    // NO_BLOCKERS and a review carries a verdict; anything else was a worker.
    const content = result.ok ? (result.content ?? '') : '';
    if (workerTouch && content !== 'NO_BLOCKERS' && !content.includes('AEOS-VERDICT')) {
      const target = path.resolve(invocation.workingDirectory ?? process.cwd(), workerTouch);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, '\nedited by the stub\n', 'utf-8');
    }
    return result;
  });

  fs.writeFileSync(path.join(projectPath, 'README.md'), '# e2e\n', 'utf-8');
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: projectPath, stdio: 'ignore' });
  };
  git('init');
  // Gate records are signed with the project repository's identity.
  git('config', 'user.name', 'AEOS E2E');
  git('config', 'user.email', 'e2e@aeos.invalid');
  git('add', '.');
  git('commit', '-m', 'initial');

  return {
    projectPath,
    aeosHome,
    cleanup() {
      workerTouch = null;
      resetDb();
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/**
 * Copies the fixture feature (`fixtures/feature-sample/`) into the project's
 * artefact tree and commits it there. Returns that commit of `.aeos`.
 */
export function addFixtureFeature(feature = 'feature-sample'): string {
  const aeosDir = path.join(process.cwd(), '.aeos');
  fs.cpSync(
    path.join(import.meta.dirname, 'fixtures', 'feature-sample'),
    path.join(aeosDir, 'features', feature),
    { recursive: true },
  );
  const git = (...args: string[]): string =>
    execFileSync('git', args, {
      cwd: aeosDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  git('add', 'features');
  git('commit', '-m', `spec(${feature}): fixture`);
  return git('rev-parse', 'HEAD').trim();
}

/** Creates an epic backed by the fixture feature (added on first use), and returns its id. */
export async function createEpic(title: string): Promise<string> {
  if (!fs.existsSync(path.join(process.cwd(), '.aeos', 'features', 'feature-sample'))) {
    addFixtureFeature();
  }
  const { output } = await runCli('ticket', 'create', title, '--spec', 'feature-sample');
  const id = /Created \w+ (\S+):/.exec(output)?.[1];
  if (!id) throw new Error(`ticket create printed no id:\n${output}`);
  return id;
}

/** Runs `aeos <args>` in-process, as the entrypoint does, capturing its output. */
export async function runCli(...args: string[]): Promise<CliResult> {
  const lines: string[] = [];
  const stdout: string[] = [];
  const capture =
    (...also: string[][]) =>
    (...parts: unknown[]): boolean => {
      for (const sink of [lines, ...also]) sink.push(parts.join(' ').replace(/\n$/, ''));
      return true;
    };
  const spies = [
    vi.spyOn(console, 'log').mockImplementation(capture(stdout)),
    vi.spyOn(console, 'error').mockImplementation(capture()),
    vi.spyOn(process.stdout, 'write').mockImplementation(capture(stdout)),
    // Commander's own usage errors, and the run events of --json.
    vi.spyOn(process.stderr, 'write').mockImplementation(capture()),
  ];
  try {
    await runAeos(['node', 'aeos', ...args], { stdout: { isTTY: false } });
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  // Left set, the exit code would fail the whole test process.
  const exitCode = Number(process.exitCode ?? 0);
  process.exitCode = undefined;
  return { output: lines.join('\n'), stdout: stdout.join('\n'), exitCode };
}

/** Reads a ticket's column and sub-state from the database. */
export function ticketState(ticketId: string): { column: Column; subState: SubStateOrNull } {
  const projectPath = process.cwd();
  const container = createContainer();
  const projectId = container.projectRepo.read(projectPath).id;
  const shown = container.ticketShow.execute({ projectId, ticketId, projectPath });
  if (!shown.ok) throw new Error(`Ticket ${ticketId} not found`);
  return { column: shown.ticket.column, subState: shown.ticket.subState };
}

/**
 * Runs the ticket's current column and approves it into the next one. Throws
 * with the CLI output when the run does not end SIGNED_OFF.
 */
export async function driveColumn(ticketId: string): Promise<void> {
  const run = await runCli('ticket', 'run', ticketId);
  const { column, subState } = ticketState(ticketId);
  if (subState !== 'SIGNED_OFF') {
    throw new Error(`${ticketId} is ${subState} in ${column}, not SIGNED_OFF:\n${run.output}`);
  }
  const approve = await runCli('ticket', 'approve', ticketId);
  if (approve.exitCode !== 0) {
    throw new Error(`approve of ${ticketId} in ${column} failed:\n${approve.output}`);
  }
}

/**
 * `ticket dod-approve` prompts on stdin, so this calls its use case directly:
 * the report is rebuilt and shown, then the answer is yes. `verified` are the
 * criteria the person vouches for (`--verified`).
 */
export async function dodApprove(ticketId: string, verified: string[] = []): Promise<void> {
  const projectPath = process.cwd();
  const useCase = createContainer().ticketDodApprove;
  const projectId = createContainer().projectRepo.read(projectPath).id;
  const shown = await useCase.review(projectId, projectPath, ticketId, verified);
  if (!shown.ok) throw new Error(`dod-approve of ${ticketId} cannot be reviewed: ${shown.error}`);
  const result = useCase.execute(projectId, projectPath, ticketId, true, undefined, shown.review);
  if (result.status !== 'approved') {
    throw new Error(`dod-approve of ${ticketId} did not approve: ${JSON.stringify(result)}`);
  }
}

/** Creates a standalone task on the bug track (`ticket create --bug`), and returns its id. */
export async function createStandaloneTask(title: string): Promise<string> {
  const { output } = await runCli('ticket', 'create', title, '--bug');
  const id = /Created \w+ (\S+):/.exec(output)?.[1];
  if (!id) throw new Error(`ticket create --bug printed no id:\n${output}`);
  return id;
}
