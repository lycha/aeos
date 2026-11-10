import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StubExecutor } from '../infrastructure/executor/stub-executor.adapter.js';
import {
  createStandaloneTask,
  createTempProject,
  dodApprove,
  driveColumn,
  runCli,
  ticketState,
  type TempProject,
} from './harness.js';

// Captured at load, before the harness points HOME at a temp directory.
const realAeosHome = path.join(os.homedir(), '.aeos');
const realRegistry = (): string | null => {
  const file = path.join(realAeosHome, 'registry.json');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
};

async function createTicket(...args: string[]): Promise<string> {
  const { output } = await runCli('ticket', 'create', ...args);
  const id = /Created \w+ (\S+):/.exec(output)?.[1];
  if (!id) throw new Error(`ticket create printed no id:\n${output}`);
  return id;
}

/** BACKLOG → IMPLEMENTATION → CODE_REVIEW → QA → DONE. */
async function driveTaskToDone(taskId: string): Promise<void> {
  await runCli('ticket', 'approve', taskId);
  for (let i = 0; i < 3; i++) await driveColumn(taskId);
}

describe('stub end-to-end pipeline', () => {
  let project: TempProject;
  let registryBefore: string | null;

  beforeEach(() => {
    registryBefore = realRegistry();
    project = createTempProject();
  });

  afterEach(() => {
    project.cleanup();
    expect(realRegistry()).toBe(registryBefore);
  });

  it('drives an epic, its two tasks and a standalone task to DONE', async () => {
    expect((await runCli('install')).exitCode).toBe(0);
    expect((await runCli('project', 'init', '--name', 'E2E', '--key', 'EE')).exitCode).toBe(0);
    expect(fs.existsSync(path.join(project.aeosHome, 'registry.json'))).toBe(true);
    // Commit what init scaffolded (skill symlinks), as a user would, so the
    // first task's baseline has nothing to pick up.
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: project.projectPath, encoding: 'utf-8' });
    git('add', '-A');
    git('commit', '-m', 'aeos project init');

    // Epic: BACKLOG → PRODUCT_SCOPING → TECH_SPEC → TASK_BREAKDOWN
    const epic = await createTicket('An epic');
    await runCli('ticket', 'approve', epic);
    await driveColumn(epic);
    await driveColumn(epic);
    expect(ticketState(epic).column).toBe('TASK_BREAKDOWN');

    // The stub cannot shell out to decompose, so the test plays the architect.
    await runCli('ticket', 'run', epic);
    expect(ticketState(epic).subState).toBe('SIGNED_OFF');
    const tasks = [
      await createTicket('First task', '--parent', epic, '--key', 'T-001'),
      await createTicket('Second task', '--parent', epic, '--key', 'T-002'),
    ];
    for (const task of tasks) await driveTaskToDone(task);

    // Epic: TASK_BREAKDOWN → INTEGRATION_REVIEW → DOD_GATE → DONE
    expect((await runCli('ticket', 'approve', epic)).exitCode).toBe(0);
    await driveColumn(epic);
    expect(ticketState(epic).column).toBe('DOD_GATE');
    // DOD_GATE is human-only: no run, just the approval.
    dodApprove(epic);

    const standalone = createStandaloneTask('A standalone task');
    await driveTaskToDone(standalone);

    for (const id of [epic, ...tasks, standalone]) {
      expect(ticketState(id).column, id).toBe('DONE');
    }

    // One git spawn for all commit assertions.
    const subjects = git('log', '--format=%s').split('\n');
    for (const id of [...tasks, standalone]) {
      expect(
        subjects.filter((s) => s.startsWith(`[${id}]`)),
        id,
      ).toHaveLength(1);
    }
  });

  it('escalates when the reviewer output carries no verdict trailer', async () => {
    // Wrap what the harness installed, not the spy itself.
    const stubRun = vi.mocked(StubExecutor.prototype.run).getMockImplementation()!;
    vi.mocked(StubExecutor.prototype.run).mockImplementation(async function (
      this: StubExecutor,
      invocation,
    ) {
      const result = await stubRun.call(this, invocation);
      if (!result.ok || !invocation.outputPath.endsWith('-review.md')) return result;
      const content = (result.content ?? '').replace(/<!-- AEOS-VERDICT[\s\S]*?-->/, '');
      fs.writeFileSync(invocation.outputPath, content, 'utf-8');
      return { ...result, content };
    });

    await runCli('install');
    await runCli('project', 'init', '--name', 'E2E', '--key', 'EE');
    const epic = await createTicket('An epic');
    await runCli('ticket', 'approve', epic);

    await runCli('ticket', 'run', epic);

    expect(ticketState(epic)).toMatchObject({ column: 'PRODUCT_SCOPING', subState: 'ESCALATED' });
  });
});
