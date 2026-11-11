import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { outputProblems } from '../cli/contract/contract-output.fixture.js';
import { loadContract } from '../cli/contract/load-contract.js';
import type { GateRecord } from '../domain/model/gate-record.js';
import { getDb } from '../infrastructure/persistence/database.js';

import {
  createStandaloneTask,
  createTempProject,
  driveColumn,
  runCli,
  ticketState,
  type TempProject,
} from './harness.js';

const EPIC = [
  'BACKLOG',
  'SPEC_REVIEW',
  'TECH_SPEC',
  'TASK_BREAKDOWN',
  'INTEGRATION_REVIEW',
  'DOD_GATE',
  'DONE',
];

const TASK = ['BACKLOG', 'IMPLEMENTATION', 'CODE_REVIEW', 'QA', 'DONE'];
const SWAPPED = ['BACKLOG', 'IMPLEMENTATION', 'QA', 'CODE_REVIEW', 'DONE'];

const validateGates = new Ajv2020({
  formats: { 'date-time': /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/ },
}).compile(
  JSON.parse(
    fs.readFileSync(
      path.resolve(
        import.meta.dirname,
        '../../../plugins/artefact-tree-pipeline/schemas/gates.schema.json',
      ),
      'utf-8',
    ),
  ) as object,
);

// The column order is the project's `.aeos/pipelines.yaml` (I1-M4-005b).
describe('pipelines file', { timeout: 30_000 }, () => {
  let project: TempProject;
  const aeos = (...parts: string[]): string => path.join(project.projectPath, '.aeos', ...parts);
  const writeTaskPipeline = (...columns: string[]): void =>
    fs.writeFileSync(
      aeos('pipelines.yaml'),
      yaml.dump({ pipelines_version: 0, pipelines: { EPIC, TASK: columns } }),
      'utf-8',
    );

  beforeEach(async () => {
    project = createTempProject();
    await runCli('install');
    await runCli('project', 'init', '--name', 'E2E', '--key', 'EE');
    for (const args of [
      ['add', '-A'],
      ['commit', '-m', 'aeos project init'],
    ]) {
      execFileSync('git', args, { cwd: project.projectPath, stdio: 'ignore' });
    }
  });

  afterEach(() => {
    project.cleanup();
  });

  it('sends a task approved out of IMPLEMENTATION to QA when CODE_REVIEW and QA are swapped', async () => {
    writeTaskPipeline('BACKLOG', 'IMPLEMENTATION', 'QA', 'CODE_REVIEW', 'DONE');
    const task = await createStandaloneTask('A task');

    await runCli('ticket', 'approve', task);
    await driveColumn(task);

    expect(ticketState(task).column).toBe('QA');
  });

  it('runs a column the project added: SECURITY_REVIEW after CODE_REVIEW', async () => {
    fs.writeFileSync(
      aeos('column-specs', 'security-review.yaml'),
      fs
        .readFileSync(aeos('column-specs', 'qa.yaml'), 'utf-8')
        .replace('column: QA', 'column: SECURITY_REVIEW')
        .replace('label: QA', 'label: Security review')
        .replace('qa-report.md', 'security.md'),
      'utf-8',
    );
    writeTaskPipeline('BACKLOG', 'IMPLEMENTATION', 'CODE_REVIEW', 'SECURITY_REVIEW', 'QA', 'DONE');
    const task = await createStandaloneTask('A task');

    await runCli('ticket', 'approve', task);
    await driveColumn(task);
    await driveColumn(task);
    expect(ticketState(task).column).toBe('SECURITY_REVIEW');

    await driveColumn(task);
    expect(ticketState(task).column).toBe('QA');
    expect((await runCli('ticket', 'list', '--column', 'security review')).output).toContain(
      'No tickets found',
    );
  });

  it('applies the template order to a project with no pipelines.yaml', async () => {
    fs.rmSync(aeos('pipelines.yaml'));
    const task = await createStandaloneTask('A task');

    expect((await runCli('ticket', 'approve', task)).exitCode).toBe(0);

    expect(ticketState(task).column).toBe('IMPLEMENTATION');
  });

  it("lists the columns of the ticket's pipeline when `ticket move` names an unknown one", async () => {
    const task = await createStandaloneTask('A task');

    const moved = await runCli('ticket', 'move', task, 'NOT_A_COLUMN', '--reason', 'testing');

    expect(moved.exitCode).toBe(2);
    expect(moved.output).toContain('Backlog, Implementation, Code review, QA, Done');
    expect(moved.output).not.toContain('Tech spec');
    expect(ticketState(task).column).toBe('BACKLOG');
  });

  // The order of a kind may change only while none of its tickets is in flight (I1-M4-005c).
  describe('order-change guard', () => {
    /** The `pipeline-change` gate records, checked against the approved schema. */
    const pipelineGates = (): GateRecord[] => {
      const file = aeos('tickets', 'pipelines', 'pipelines-gates.yaml');
      if (!fs.existsSync(file)) return [];
      const document = yaml.load(fs.readFileSync(file, 'utf-8')) as { records: GateRecord[] };
      expect(validateGates(document), JSON.stringify(validateGates.errors)).toBe(true);
      return document.records;
    };
    const acceptedTaskPipeline = (): unknown =>
      JSON.parse(
        (
          getDb().prepare("SELECT columns_json FROM pipeline_state WHERE kind = 'TASK'").get() as {
            columns_json: string;
          }
        ).columns_json,
      );
    /** A standalone task approved and driven into CODE_REVIEW. */
    const taskInCodeReview = async (): Promise<string> => {
      const task = await createStandaloneTask('A task');
      await runCli('ticket', 'approve', task);
      await driveColumn(task);
      expect(ticketState(task).column).toBe('CODE_REVIEW');
      return task;
    };

    it('stores the pipeline of a fresh project on its first command, with no gate record', async () => {
      await createStandaloneTask('A task');

      expect(acceptedTaskPipeline()).toEqual(TASK);
      expect(pipelineGates()).toEqual([]);
    });

    it('accepts a reordered TASK pipeline while no task is in flight, and records it', async () => {
      const task = await createStandaloneTask('A task');
      writeTaskPipeline(...SWAPPED);

      const approved = await runCli('ticket', 'approve', task);

      expect(approved.exitCode).toBe(0);
      expect(approved.output).toContain('TASK pipeline changed');
      expect(acceptedTaskPipeline()).toEqual(SWAPPED);
      expect(pipelineGates()).toEqual([
        expect.objectContaining({
          gate: 'pipeline-change',
          verdict: 'approved',
          decided_by: 'AEOS E2E <e2e@aeos.invalid>',
          reason: `TASK pipeline changed from ${TASK.join(' → ')} to ${SWAPPED.join(' → ')}`,
        }),
      ]);
    });

    it('refuses `ticket run` while a task is in flight, lets `ticket list` work, and recovers when the file is restored', async () => {
      const task = await taskInCodeReview();
      const original = fs.readFileSync(aeos('pipelines.yaml'), 'utf-8');
      // QA is dropped as well as moved, so only the accepted order can label it.
      writeTaskPipeline('BACKLOG', 'CODE_REVIEW', 'IMPLEMENTATION', 'DONE');

      const refused = await runCli('ticket', 'run', task);
      expect(refused.exitCode).toBe(3);
      expect(refused.output).toContain(`${task} (CODE_REVIEW)`);
      expect(refused.output).toContain('BACKLOG, IMPLEMENTATION, CODE_REVIEW, QA, DONE');
      expect(ticketState(task)).toMatchObject({ column: 'CODE_REVIEW', subState: 'READY' });
      // Any guarded command can be refused this way: exit 3 is a global response.
      const ready = await runCli('ticket', 'ready', task, '--json');
      expect(ready.exitCode).toBe(3);
      expect(outputProblems(loadContract(), 'ticket ready', ready.stdout, 3)).toEqual([]);

      const listed = await runCli('ticket', 'list', '--column', 'qa');
      expect(listed.exitCode).toBe(0);
      expect(listed.output).toContain('No tickets found');
      expect((await runCli('ticket', 'list')).output).toContain('Code review');

      fs.writeFileSync(aeos('pipelines.yaml'), original, 'utf-8');
      await driveColumn(task);
      expect(ticketState(task).column).toBe('QA');
      expect(pipelineGates()).toEqual([]);
    });

    it('accepts a changed EPIC pipeline while only tasks are in flight: the guard is per kind', async () => {
      const task = await taskInCodeReview();
      fs.writeFileSync(
        aeos('pipelines.yaml'),
        yaml.dump({
          pipelines_version: 0,
          pipelines: { EPIC: EPIC.filter((column) => column !== 'TECH_SPEC'), TASK },
        }),
        'utf-8',
      );

      await driveColumn(task);

      expect(ticketState(task).column).toBe('QA');
      expect(pipelineGates()).toEqual([
        expect.objectContaining({ reason: expect.stringContaining('EPIC pipeline changed') }),
      ]);
    });

    it('does not take a changed label for a pipeline change', async () => {
      const task = await taskInCodeReview();
      const qa = aeos('column-specs', 'qa.yaml');
      fs.writeFileSync(
        qa,
        fs.readFileSync(qa, 'utf-8').replace('label: QA', 'label: Acceptance'),
        'utf-8',
      );

      await driveColumn(task);

      expect((await runCli('ticket', 'list')).output).toContain('Acceptance');
      expect(pipelineGates()).toEqual([]);
    });
  });
});
