// End-to-end harness — drives the real CLI against a throwaway project with
// AEOS_EXECUTOR=stub. Later tasks extend this file rather than writing their
// own scaffolding.

import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { vi } from 'vitest';

import { buildInitialTicketDocument } from '../application/services/ticket-document.js';
import { buildProgram, createContainer } from '../cli/index.js';
import type { Column } from '../domain/model/column.js';
import type { SubStateOrNull } from '../domain/model/sub-state.js';
import { TicketKind } from '../domain/model/ticket-kind.js';
import { StubExecutor } from '../infrastructure/executor/stub-executor.adapter.js';
import { PythonDecisionsLint } from '../infrastructure/spec/decisions-lint.adapter.js';
import { getDb, resetDb } from '../infrastructure/persistence/database.js';
import { SqliteTicketRepository } from '../infrastructure/persistence/sqlite-ticket.repository.js';

/** `ticket create --spec` runs lint_decisions.py, which needs python3 with PyYAML and jsonschema. */
export const pythonReady =
  spawnSync('python3', ['-c', 'import yaml, jsonschema'], { stdio: 'ignore' }).status === 0;
// Captured at load: the harness moves HOME, and with it python's per-user packages.
const pythonUserSite = spawnSync('python3', ['-m', 'site', '--user-site'], {
  encoding: 'utf-8',
}).stdout?.trim();

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
 * would edit the repository.
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
    vi.spyOn(PythonDecisionsLint.prototype, 'lint').mockReturnValue({
      schemaErrors: [],
      lintErrors: [],
      escalated: [],
    });
  }

  const stubRun = StubExecutor.prototype.run;
  vi.spyOn(StubExecutor.prototype, 'run').mockImplementation(function (
    this: StubExecutor,
    invocation,
  ) {
    if (invocation.column === 'IMPLEMENTATION' && invocation.workingDirectory) {
      fs.writeFileSync(
        path.join(invocation.workingDirectory, `stub-${invocation.ticketId}.txt`),
        'stub change\n',
        'utf-8',
      );
    }
    return stubRun.call(this, invocation);
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

/** Runs `aeos <args>` in-process through Commander, capturing its output. */
export async function runCli(...args: string[]): Promise<CliResult> {
  const lines: string[] = [];
  const capture = (...parts: unknown[]): void => {
    lines.push(parts.join(' '));
  };
  const spies = [
    vi.spyOn(console, 'log').mockImplementation(capture),
    vi.spyOn(console, 'error').mockImplementation(capture),
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    }),
  ];
  try {
    await buildProgram().parseAsync(['node', 'aeos', ...args]);
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  // Commands report failure through process.exitCode; left set, it would fail
  // the whole test process.
  const exitCode = Number(process.exitCode ?? 0);
  process.exitCode = undefined;
  return { output: lines.join('\n'), exitCode };
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

/** `ticket dod-approve` prompts on stdin, so this calls its use case directly. */
export function dodApprove(ticketId: string): void {
  const projectPath = process.cwd();
  const container = createContainer();
  const projectId = container.projectRepo.read(projectPath).id;
  const result = container.ticketDodApprove.execute(projectId, projectPath, ticketId, true);
  if (result.status !== 'approved') {
    throw new Error(`dod-approve of ${ticketId} did not approve: ${JSON.stringify(result)}`);
  }
}

/**
 * Creates a TASK with no parent, and returns its id.
 *
 * shortcut: inserted through the repository because no command creates a
 * standalone task yet; switch to `ticket create --bug` when I1-M4-003 lands.
 */
export function createStandaloneTask(title: string): string {
  const projectPath = process.cwd();
  const container = createContainer();
  const project = container.projectRepo.read(projectPath);
  const ticket = new SqliteTicketRepository(getDb()).createAtomic(project.id, (nextNum) => {
    const now = new Date().toISOString();
    return {
      id: `${project.key}-${nextNum}`,
      projectId: project.id,
      title,
      kind: TicketKind.TASK,
      parentId: null,
      taskKey: null,
      column: 'BACKLOG',
      subState: null,
      createdAt: now,
      updatedAt: now,
    };
  });
  container.artifactStore.writeArtifact(
    projectPath,
    ticket.id,
    `${ticket.id}-ticket.md`,
    buildInitialTicketDocument(ticket),
  );
  return ticket.id;
}
