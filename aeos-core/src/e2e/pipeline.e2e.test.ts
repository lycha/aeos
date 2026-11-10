import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunRecord } from '../domain/model/run-record.js';
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

// The approved contract lives with the plugin, outside this package.
const runRecordSchema = JSON.parse(
  fs.readFileSync(
    path.resolve(
      import.meta.dirname,
      '../../../plugins/artefact-tree-pipeline/schemas/run-record.schema.json',
    ),
    'utf-8',
  ),
) as object;
const validateRunRecord = new Ajv2020({
  // shortcut: one format in use, so a pattern instead of the ajv-formats package.
  formats: { 'date-time': /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/ },
}).compile(runRecordSchema);

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

    // Run records: one per executor invocation, each valid against the
    // approved schema, with its brief and its log, all committed.
    const aeosDir = path.join(project.projectPath, '.aeos');
    const read = (relative: string): string =>
      fs.readFileSync(path.join(aeosDir, relative), 'utf-8');
    const records: RunRecord[] = [];
    for (const id of [epic, ...tasks, standalone]) {
      const runsDir = path.join('tickets', id, 'runs');
      for (const file of fs.readdirSync(path.join(aeosDir, runsDir))) {
        if (file.endsWith('.json')) records.push(JSON.parse(read(path.join(runsDir, file))));
      }
    }
    expect(records).toHaveLength(vi.mocked(StubExecutor.prototype.run).mock.calls.length);
    expect(new Set(records.map((record) => record.role))).toEqual(
      new Set(['preflight', 'worker', 'reviewer']),
    );
    for (const record of records) {
      expect(validateRunRecord(record), JSON.stringify(validateRunRecord.errors)).toBe(true);
      expect(createHash('sha256').update(read(record.brief!.path)).digest('hex')).toBe(
        record.brief!.sha256,
      );
      expect(fs.existsSync(path.join(aeosDir, record.transcript!))).toBe(true);
      // Every artefact's last line names the run that wrote it.
      if (record.role !== 'preflight') {
        expect(read(record.output!).trimEnd().split('\n').pop()).toMatch(/^<!-- AEOS-RUN: RUN-/);
      }
    }
    // Later attempts overwrite an artefact, so check the link from the artefact's side too.
    for (const id of [epic, ...tasks, standalone]) {
      for (const file of fs.readdirSync(path.join(aeosDir, 'tickets', id))) {
        if (!file.endsWith('.md')) continue;
        const runId = /<!-- AEOS-RUN: (\S+) -->\s*$/.exec(
          read(path.join('tickets', id, file)),
        )?.[1];
        if (runId) expect(records.map((record) => record.run_id)).toContain(runId);
      }
    }
    expect(
      execFileSync('git', ['status', '--porcelain', '--', 'tickets/*/runs'], {
        cwd: aeosDir,
        encoding: 'utf-8',
      }),
    ).toBe('');
    expect((await runCli('ticket', 'show', epic)).output).toContain(
      records.find((record) => record.ticket === epic)!.run_id,
    );

    // `aeos costs` is registered and reads what the runs recorded.
    const costs = (await runCli('costs', '--epic', epic)).output;
    expect(costs).toContain('AEOS Cost Report');
    for (const id of [epic, ...tasks]) expect(costs).toContain(id);
    expect(costs).not.toContain(standalone);
    for (const role of ['preflight', 'worker', 'reviewer']) expect(costs).toContain(role);

    // One git spawn for all commit assertions.
    const subjects = git('log', '--format=%s').split('\n');
    for (const id of [...tasks, standalone]) {
      expect(
        subjects.filter((s) => s.startsWith(`[${id}]`)),
        id,
      ).toHaveLength(1);
    }
  });

  it('accepts a budget on a stub run and completes it', async () => {
    await runCli('install');
    await runCli('project', 'init', '--name', 'E2E', '--key', 'EE');
    const epic = await createTicket('An epic');
    await runCli('ticket', 'approve', epic);

    const run = await runCli('orchestrator', 'run', epic, '--budget', '5');

    // Columns advance manually, so the run stops for approval after one column.
    expect(run.output).toContain(`${epic} — AWAITING_APPROVAL`);
    expect(run.exitCode).toBe(0);
    expect(ticketState(epic)).toMatchObject({ column: 'PRODUCT_SCOPING', subState: 'SIGNED_OFF' });
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

  it('runs the project checks before the reviewer, and skips the reviewer when one fails', async () => {
    await runCli('install');
    await runCli('project', 'init', '--name', 'E2E', '--key', 'EE');
    const aeosDir = path.join(project.projectPath, '.aeos');
    const setChecks = (command: string): void => {
      const file = path.join(aeosDir, 'project.json');
      const config = JSON.parse(fs.readFileSync(file, 'utf-8')) as object;
      const checks = [{ name: 'gate', command, timeoutSeconds: 30 }];
      fs.writeFileSync(file, JSON.stringify({ ...config, checks }), 'utf-8');
    };
    const runsOf = (ticketId: string): RunRecord[] => {
      const dir = path.join(aeosDir, 'tickets', ticketId, 'runs');
      return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as RunRecord);
    };
    const briefOf = (record: RunRecord): string =>
      fs.readFileSync(path.join(aeosDir, record.brief!.path), 'utf-8');

    // Passing: the reviewer is briefed with the checks table.
    setChecks('node -e "process.exit(0)"');
    const green = createStandaloneTask('A task with green checks');
    await runCli('ticket', 'approve', green);
    await runCli('ticket', 'run', green);

    expect(ticketState(green)).toMatchObject({ column: 'IMPLEMENTATION', subState: 'SIGNED_OFF' });
    const greenRuns = runsOf(green);
    // Run ids sort by second, so the order within one run is not fixed.
    expect(greenRuns.map((record) => record.role).sort()).toEqual([
      'checks',
      'preflight',
      'reviewer',
      'worker',
    ]);
    expect(briefOf(greenRuns.find((record) => record.role === 'reviewer')!)).toMatch(
      /\| gate \| passed \| [\d.]+s \|/,
    );

    // Failing: no reviewer run for the attempt, and the output reaches the retry.
    setChecks(`node -e "console.log('gate is red'); process.exit(1)"`);
    const red = createStandaloneTask('A task with red checks');
    await runCli('ticket', 'approve', red);
    await runCli('ticket', 'run', red);

    expect(ticketState(red)).toMatchObject({ column: 'IMPLEMENTATION', subState: 'ESCALATED' });
    const redRuns = runsOf(red);
    expect(redRuns.filter((record) => record.role === 'reviewer')).toEqual([]);
    const redChecks = redRuns.filter((record) => record.role === 'checks');
    expect(redChecks.length).toBeGreaterThan(0);
    for (const record of [...greenRuns, ...redRuns]) {
      expect(validateRunRecord(record), JSON.stringify(validateRunRecord.errors)).toBe(true);
    }
    for (const record of redChecks) {
      expect(record).toMatchObject({ verdict: 'CHECKS_FAILED', executor: 'shell' });
    }
    const retry = redRuns.find((record) => record.role === 'worker' && record.attempt === 2)!;
    expect(briefOf(retry)).toContain('gate is red');

    // Every run record is committed, and so is the table the reviewer relied on.
    const aeosGit = (...args: string[]): string =>
      execFileSync('git', args, { cwd: aeosDir, encoding: 'utf-8' });
    expect(aeosGit('status', '--porcelain', '--', 'tickets/*/runs')).toBe('');
    expect(aeosGit('ls-files', `tickets/${green}/${green}-checks.md`)).not.toBe('');
  });
});
