import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

    expect(moved.exitCode).toBe(1);
    expect(moved.output).toContain('Backlog, Implementation, Code review, QA, Done');
    expect(moved.output).not.toContain('Tech spec');
    expect(ticketState(task).column).toBe('BACKLOG');
  });
});
