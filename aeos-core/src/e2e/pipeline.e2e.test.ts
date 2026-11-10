import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunRecord } from '../domain/model/run-record.js';
import { StubExecutor } from '../infrastructure/executor/stub-executor.adapter.js';
import {
  addFixtureFeature,
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

// Each case spawns git and runs whole pipelines; the 5s default is too tight.
describe('stub end-to-end pipeline', { timeout: 30_000 }, () => {
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
      execFileSync('git', args, {
        cwd: project.projectPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    git('add', '-A');
    git('commit', '-m', 'aeos project init');
    const defaultBranch = git('branch', '--show-current').trim();

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
    // A child task is refused on the default branch. `orchestrator run` would
    // have put the epic on its own branch; the test plays that part too.
    await runCli('ticket', 'approve', tasks[0]!);
    const refused = await runCli('ticket', 'run', tasks[0]!);
    expect(refused.output).toContain(`on the default branch '${defaultBranch}'`);
    expect(ticketState(tasks[0]!)).toMatchObject({ column: 'IMPLEMENTATION', subState: 'READY' });
    git('checkout', '-b', `aeos/${epic}`);
    for (let i = 0; i < 3; i++) await driveColumn(tasks[0]!);
    await driveTaskToDone(tasks[1]!);

    // Epic: TASK_BREAKDOWN → INTEGRATION_REVIEW → DOD_GATE → DONE
    expect((await runCli('ticket', 'approve', epic)).exitCode).toBe(0);
    await driveColumn(epic);
    expect(ticketState(epic).column).toBe('DOD_GATE');
    // DOD_GATE is human-only: no run, just the approval.
    dodApprove(epic);

    // Approved out of INTEGRATION_REVIEW: the (stub) pull request is recorded.
    expect((await runCli('ticket', 'show', epic)).output).toContain(
      `PR:     https://stub.invalid/pull/aeos/${epic}`,
    );

    // A standalone task started from the default branch moves to its own.
    git('checkout', defaultBranch);
    const standalone = createStandaloneTask('A standalone task');
    await driveTaskToDone(standalone);
    expect(git('branch', '--show-current').trim()).toBe(`aeos/${standalone}`);
    expect(git('tag', '--list', `aeos-base/${standalone}`).trim()).toBe(`aeos-base/${standalone}`);
    expect((await runCli('ticket', 'show', standalone)).output).toContain(
      `PR:     https://stub.invalid/pull/aeos/${standalone}`,
    );

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
      // AEOS_EXECUTOR=stub is what ran, so it is what the record names.
      expect(record).toMatchObject({ executor: 'stub', cost_basis: 'none' });
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

    // One commit per task, on a task or epic branch, with its trailers.
    const messages = git('log', '--all', '--format=%B%x00').split('\0');
    const commitOf = (id: string): string[] =>
      messages.map((message) => message.trim()).filter((m) => m.startsWith(`[${id}]`));
    for (const id of [...tasks, standalone]) expect(commitOf(id), id).toHaveLength(1);
    for (const id of tasks) expect(commitOf(id)[0]).toContain(`\n\nTicket: ${id}\nEpic: ${epic}`);
    expect(commitOf(standalone)[0]).toMatch(new RegExp(`\\n\\nTicket: ${standalone}$`));

    // The engine committed nothing on the default branch: only the test's own two commits.
    expect(git('log', defaultBranch, '--format=%s').trim().split('\n')).toEqual([
      'aeos project init',
      'initial',
    ]);
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

  // `ticket create --spec` runs lint_decisions.py, which needs python3 with PyYAML and jsonschema.
  const pythonReady =
    spawnSync('python3', ['-c', 'import yaml, jsonschema'], { stdio: 'ignore' }).status === 0;
  // The harness moves HOME, and with it python's per-user packages.
  const pythonUserSite = spawnSync('python3', ['-m', 'site', '--user-site'], {
    encoding: 'utf-8',
  }).stdout?.trim();

  it.skipIf(!pythonReady)(
    'pins a spec-backed epic, shows the pin on its task, and warns once the spec moves',
    async () => {
      if (pythonUserSite) vi.stubEnv('PYTHONPATH', pythonUserSite);
      await runCli('install');
      await runCli('project', 'init', '--name', 'E2E', '--key', 'EE');
      const aeosDir = path.join(project.projectPath, '.aeos');
      const specFile = path.join(aeosDir, 'features', 'feature-sample', 'spec.md');
      const aeosGit = (...args: string[]): string =>
        execFileSync('git', args, { cwd: aeosDir, encoding: 'utf-8' });
      const pinned = addFixtureFeature();

      const refused = await runCli(
        'ticket',
        'create',
        'Greeting',
        '--spec',
        'feature-sample',
        '--parent',
        'EE-1',
      );
      expect(refused.exitCode).toBe(1);
      expect(refused.output).toContain('--parent');

      fs.appendFileSync(specFile, '\nAn uncommitted thought.\n');
      const dirty = await runCli('ticket', 'create', 'Greeting', '--spec', 'feature-sample');
      expect(dirty.exitCode).toBe(1);
      expect(dirty.output).toContain('uncommitted changes');
      aeosGit('checkout', '--', 'features');

      const created = await runCli('ticket', 'create', 'Greeting', '--spec', 'feature-sample');
      expect(created.output).toContain(`Spec: EE-aeos@${pinned} (features/feature-sample)`);
      const epic = /Created \w+ (\S+):/.exec(created.output)![1]!;
      const task = await createTicket('Say hello', '--parent', epic, '--key', 'T-001');

      const pinLine = `Spec:   EE-aeos@${pinned} (features/feature-sample)`;
      const shownEpic = await runCli('ticket', 'show', epic);
      expect(shownEpic.output).toContain(pinLine);
      expect(shownEpic.output).not.toContain('spec has moved');
      expect((await runCli('ticket', 'show', task)).output).toContain(pinLine);
      expect(
        fs.readFileSync(path.join(aeosDir, 'tickets', epic, `${epic}-ticket.md`), 'utf-8'),
      ).toContain(`- Spec: EE-aeos@${pinned} (features/feature-sample)`);

      fs.appendFileSync(specFile, '\nA later amendment.\n');
      aeosGit('commit', '-am', 'spec(feature-sample): amend');

      const moved = await runCli('ticket', 'show', epic);
      expect(moved.output).toContain(pinLine);
      expect(moved.output).toContain('spec has moved since this epic was pinned');

      // Every run of the epic records the pin, and the record still fits the schema.
      // Its brief carries the spec as pinned, not as amended since.
      await runCli('ticket', 'approve', epic);
      await runCli('ticket', 'run', epic);
      const runsDir = path.join(aeosDir, 'tickets', epic, 'runs');
      const records = fs
        .readdirSync(runsDir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => JSON.parse(fs.readFileSync(path.join(runsDir, file), 'utf-8')) as RunRecord);
      expect(records.length).toBeGreaterThan(0);
      for (const record of records) {
        expect(record.spec_pin).toEqual({
          repo: 'EE-aeos',
          commit: pinned,
          path: 'features/feature-sample',
        });
        expect(validateRunRecord(record), JSON.stringify(validateRunRecord.errors)).toBe(true);
      }
      const briefs = fs
        .readdirSync(runsDir)
        .filter((file) => file.endsWith('.brief.md'))
        .map((file) => fs.readFileSync(path.join(runsDir, file), 'utf-8'));
      expect(briefs.length).toBeGreaterThan(0);
      for (const brief of briefs) {
        expect(brief).toContain(`## Specification (pinned EE-aeos@${pinned.slice(0, 7)})`);
        expect(brief).toContain('the system shall greet them as "there"');
        expect(brief).toContain('Scenario: A visitor with no saved name');
        expect(brief).not.toContain('A later amendment.');
      }
    },
  );

  it('fails a run that touches a protected path, in either repository, and restores it', async () => {
    await runCli('install');
    await runCli('project', 'init', '--name', 'E2E', '--key', 'EE');
    const aeosDir = path.join(project.projectPath, '.aeos');
    const configFile = path.join(aeosDir, 'project.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8')) as object;
    fs.writeFileSync(
      configFile,
      JSON.stringify({ ...config, protectedPaths: ['src/cli/generated/**'] }),
      'utf-8',
    );
    const failedRun = (ticketId: string): RunRecord => {
      const dir = path.join(aeosDir, 'tickets', ticketId, 'runs');
      return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as RunRecord)
        .find((record) => record.exit === 'failed')!;
    };

    // `.aeos` repository: a rubric the reviewer will judge the work against.
    // Creating the epic commits the scaffold, so the rubric is tracked.
    const epic = await createTicket('An epic');
    await runCli('ticket', 'approve', epic);
    const rubric = '.aeos/rubrics/structure/code-structure.md';
    const rubricFile = path.join(project.projectPath, rubric);
    const original = fs.readFileSync(rubricFile, 'utf-8');

    vi.stubEnv('AEOS_STUB_TOUCH', rubric);
    const epicRun = await runCli('ticket', 'run', epic);

    expect(ticketState(epic)).toMatchObject({ column: 'PRODUCT_SCOPING', subState: 'FAILED' });
    expect(epicRun.output).toContain(rubric);
    expect(fs.readFileSync(rubricFile, 'utf-8')).toBe(original);
    expect(failedRun(epic)).toMatchObject({ role: 'worker' });
    expect(failedRun(epic).error).toContain(rubric);
    expect(validateRunRecord(failedRun(epic)), JSON.stringify(validateRunRecord.errors)).toBe(true);

    // Project repository: a new file under a configured glob.
    const task = createStandaloneTask('A task that writes generated code');
    await runCli('ticket', 'approve', task);
    const generated = 'src/cli/generated/commands.ts';

    vi.stubEnv('AEOS_STUB_TOUCH', generated);
    const taskRun = await runCli('ticket', 'run', task);

    expect(ticketState(task)).toMatchObject({ column: 'IMPLEMENTATION', subState: 'FAILED' });
    expect(taskRun.output).toContain(generated);
    expect(fs.existsSync(path.join(project.projectPath, generated))).toBe(false);
    expect(failedRun(task).error).toContain(generated);
  });
});
