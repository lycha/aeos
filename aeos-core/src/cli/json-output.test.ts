// The acceptance criteria of I1-M4-004c that are about what a command writes
// and how it exits, through the generated registration and the real handlers.

import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { programWith } from './commands/program.fixture.js';
import type { Container } from './container.js';
import { runCli } from './index.js';
import type { Prompt } from './prompt.js';
import { displayOrder } from '../domain/model/column.js';
import { columnLabels } from '../domain/services/column-labels.js';
import { templatePipelines } from '../infrastructure/spec-loader/yaml-pipeline-loader.adapter.js';

const labels = columnLabels(displayOrder(templatePipelines()), {}, null);
const projectRepo = {
  findRoot: vi.fn().mockReturnValue('/test'),
  read: vi.fn().mockReturnValue({ id: 'proj-1', key: 'AEOS' }),
};
const ticket = {
  id: 'AEOS-1',
  title: 'A ticket',
  kind: 'EPIC',
  parentId: null,
  column: 'TECH_SPEC',
  subState: 'READY',
};
/** `ticket show` before a run and after it: one new run record, costing `costUsd`. */
function shown(subState: string, costUsd: number | null = 0.5, escalation: unknown = null) {
  const base = { ok: true, artifacts: [], children: [], parent: null, specPin: null };
  return vi
    .fn()
    .mockReturnValueOnce({ ...base, ticket, runs: ['RUN-old'], executions: [{ costUsd: 1 }] })
    .mockReturnValue({
      ...base,
      ticket: { ...ticket, subState, escalation },
      runs: ['RUN-old', 'RUN-new'],
      executions: [{ costUsd: 1 }, { costUsd }],
    });
}

interface Ran {
  readonly out: string[];
  readonly err: string[];
  readonly exit: unknown;
  /** stdout, which under --json must be exactly one JSON object. */
  envelope(): Record<string, never>;
}

async function cli(
  container: Record<string, unknown>,
  args: string[],
  prompt?: Prompt,
): Promise<Ran> {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((text) => void out.push(String(text)));
  vi.spyOn(console, 'error').mockImplementation((text) => void err.push(String(text)));
  vi.spyOn(process.stdout, 'write').mockImplementation((text) => (out.push(String(text)), true));
  vi.spyOn(process.stderr, 'write').mockImplementation((text) => (err.push(String(text)), true));
  const program = programWith(
    { projectRepo, columnLabels: () => labels, ...container } as unknown as Container,
    new Command(),
    prompt,
  );
  await program.parseAsync(['node', 'aeos', ...args]);
  const exit = process.exitCode;
  process.exitCode = undefined;
  vi.restoreAllMocks();
  return { out, err, exit, envelope: () => JSON.parse(out.join('\n')) as Record<string, never> };
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  projectRepo.findRoot.mockReturnValue('/test');
});

const ticketReady = (result: unknown) => ({ ticketReady: { execute: () => result } });
const ticketRun = (result: unknown) => ({
  execute: vi.fn().mockResolvedValue(result),
  interrupt: vi.fn(),
});

describe('--json', () => {
  it('writes one envelope with ok: true and the data the contract declares', async () => {
    const ran = await cli(
      ticketReady({ status: 'readied', ticketId: 'AEOS-1', previousSubState: 'FAILED' }),
      ['ticket', 'ready', 'AEOS-1', '--json'],
    );

    expect(ran.out).toHaveLength(1);
    expect(ran.err).toEqual([]);
    expect(ran.envelope()).toEqual({
      ok: true,
      command: 'ticket ready',
      exit: 0,
      contractVersion: 0,
      data: { ticketId: 'AEOS-1', subState: 'READY' },
      error: null,
      warnings: [],
    });
    expect(ran.exit).toBe(0);
  });

  it('writes one envelope with ok: false and a stable code when the command fails', async () => {
    const ran = await cli(
      ticketReady({ status: 'error', ticketId: 'AEOS-9', error: 'Ticket AEOS-9 not found' }),
      ['ticket', 'ready', 'AEOS-9', '--json'],
    );

    expect(ran.out).toHaveLength(1);
    expect(ran.envelope()).toMatchObject({
      ok: false,
      exit: 1,
      data: null,
      error: { code: 'TICKET_NOT_FOUND', message: 'Ticket AEOS-9 not found', resource: null },
    });
    expect(ran.exit).toBe(1);
  });

  it('reports an error a handler did not expect as an envelope too, with no stack trace', async () => {
    const ran = await cli(
      {
        ticketReady: {
          execute: () => {
            throw new Error('disk on fire');
          },
        },
      },
      ['ticket', 'ready', 'AEOS-1', '--json'],
    );

    expect(ran.envelope()).toMatchObject({
      ok: false,
      error: { code: 'COMMAND_FAILED', message: 'disk on fire' },
    });
    expect(ran.out.join('\n')).not.toContain('    at ');
    expect(ran.exit).toBe(1);
  });
});

describe('text output', () => {
  it('is what it was: the result on stdout, an error on stderr as "Error: …"', async () => {
    const ok = await cli(
      ticketReady({ status: 'readied', ticketId: 'AEOS-1', previousSubState: null }),
      ['ticket', 'ready', 'AEOS-1'],
    );
    expect(ok.out).toEqual(['✓ Ticket AEOS-1 marked READY (previous state: NONE)']);
    expect(ok.err).toEqual([]);

    const failed = await cli(
      ticketReady({ status: 'error', ticketId: 'AEOS-9', error: 'Ticket AEOS-9 not found' }),
      ['ticket', 'ready', 'AEOS-9'],
    );
    expect(failed.out).toEqual([]);
    expect(failed.err).toEqual(['Error: Ticket AEOS-9 not found']);
  });
});

describe('exit codes', () => {
  it('ticket run: an escalation is needs_human, not failure', async () => {
    const container = {
      ticketShow: { execute: shown('ESCALATED') },
      ticketRun: ticketRun({
        status: 'escalated',
        ticketId: 'AEOS-1',
        reason: 'ITERATIONS_EXHAUSTED',
        message: 'Five attempts, still rejected.',
        attempts: 5,
        artifactPath: '/test/review.md',
      }),
    };

    const ran = await cli(container, ['ticket', 'run', 'AEOS-1', '--json']);

    expect(ran.exit).toBe(3);
    expect(ran.envelope()).toMatchObject({
      ok: false,
      exit: 3,
      error: { code: 'ITERATIONS_EXHAUSTED' },
      data: {
        ticketId: 'AEOS-1',
        column: 'TECH_SPEC',
        subState: 'ESCALATED',
        attempts: 5,
        runIds: ['RUN-new'],
        costUsd: 0.5,
        escalation: {
          reason: 'ITERATIONS_EXHAUSTED',
          message: 'Five attempts, still rejected.',
          attempt: 5,
          artifactPath: '/test/review.md',
        },
      },
    });

    container.ticketShow.execute = shown('ESCALATED');
    const text = await cli(container, ['ticket', 'run', 'AEOS-1']);
    expect(text.exit).toBe(3);
    expect(text.err.join('\n')).toContain('⏸ Ticket AEOS-1 escalated after 5 attempt(s)');
  });

  it('ticket run: a crashed executor is failure', async () => {
    const ran = await cli(
      {
        ticketShow: { execute: shown('FAILED') },
        ticketRun: ticketRun({
          status: 'failed',
          ticketId: 'AEOS-1',
          error: 'claude exited with code 1',
        }),
      },
      ['ticket', 'run', 'AEOS-1', '--json'],
    );

    expect(ran.exit).toBe(1);
    expect(ran.envelope()).toMatchObject({
      error: { code: 'EXECUTOR_NONZERO_EXIT' },
      data: { subState: 'FAILED', escalation: null },
    });
  });

  it('ticket run: a block is needs_human, and an interrupt is interrupted', async () => {
    const blocked = await cli(
      {
        ticketShow: {
          execute: shown('BLOCKED', 0.5, {
            reason: 'PREFLIGHT_BLOCKERS',
            message: 'Two questions.',
          }),
        },
        ticketRun: ticketRun({ status: 'blocked', ticketId: 'AEOS-1', blockers: ['Which db?'] }),
      },
      ['ticket', 'run', 'AEOS-1'],
    );
    expect(blocked.exit).toBe(3);
    expect(blocked.out.join('\n')).toContain('⚠ Ticket AEOS-1 is blocked:\n  - Which db?');

    const interrupted = await cli(
      {
        ticketShow: { execute: shown('INTERRUPTED') },
        ticketRun: ticketRun({
          status: 'failed',
          ticketId: 'AEOS-1',
          error: 'Execution interrupted by operator',
        }),
      },
      ['ticket', 'run', 'AEOS-1'],
    );
    expect(interrupted.exit).toBe(130);
  });

  it('ticket run: a cost that could not be read is one warning and a null cost', async () => {
    const ran = await cli(
      {
        ticketShow: { execute: shown('SIGNED_OFF', null) },
        ticketRun: ticketRun({
          status: 'success',
          ticketId: 'AEOS-1',
          artifactPath: '/a.md',
          reviewPath: '/r.md',
          attempts: 1,
        }),
      },
      ['ticket', 'run', 'AEOS-1', '--json'],
    );

    expect(ran.exit).toBe(0);
    expect(ran.envelope().warnings).toEqual([
      { code: 'COST_UNKNOWN', message: expect.stringContaining('AEOS-1') },
    ]);
    expect(ran.envelope().data).toMatchObject({ costUsd: null, subState: 'SIGNED_OFF' });
  });

  it('ticket run --json starts no display: events are JSON lines on stderr', async () => {
    const execute = vi.fn(
      async (
        _project: string,
        _path: string,
        ticketId: string,
        _overrides: unknown,
        observer: { onEvent(event: unknown): void },
      ) => {
        observer.onEvent({ type: 'ticket-run.started', ticketId, column: 'TECH_SPEC' });
        return { status: 'success', ticketId, artifactPath: '/a.md', reviewPath: '/r.md' };
      },
    );

    const ran = await cli(
      { ticketShow: { execute: shown('SIGNED_OFF') }, ticketRun: { execute, interrupt: vi.fn() } },
      ['ticket', 'run', 'AEOS-1', '--json'],
    );

    expect(ran.out).toHaveLength(1);
    expect(ran.envelope().ok).toBe(true);
    expect(ran.err.map((line) => JSON.parse(line) as unknown)).toEqual([
      { type: 'ticket-run.started', ticketId: 'AEOS-1', column: 'TECH_SPEC' },
    ]);
  });

  it('orchestrator run: a halt awaiting approval is needs_human', async () => {
    const halted = {
      epicId: 'AEOS-1',
      haltReason: 'AWAITING_APPROVAL',
      message: 'AEOS-1 is ready to leave TECH_SPEC, but that column advances manually.',
      steps: [{ action: 'run', ticketId: 'AEOS-1', column: 'TECH_SPEC', outcome: 'signed off' }],
      spentUsd: 1.25,
    };
    const orchestrator = { run: vi.fn().mockResolvedValue(halted), interrupt: vi.fn() };

    const json = await cli({ orchestrator }, ['orchestrator', 'run', 'AEOS-1', '--json']);
    expect(json.exit).toBe(3);
    expect(json.envelope()).toMatchObject({
      error: { code: 'AWAITING_APPROVAL' },
      data: { epicId: 'AEOS-1', haltReason: 'AWAITING_APPROVAL', steps: 1, spentUsd: 1.25 },
    });

    const text = await cli({ orchestrator }, ['orchestrator', 'run', 'AEOS-1']);
    expect(text.exit).toBe(3);
    expect(text.out.join('\n')).toContain('✓ AEOS-1 — AWAITING_APPROVAL');
    expect(text.out.join('\n')).toContain('ready to leave Tech spec, but');
  });

  it('a missing required argument is usage', async () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((text) => void out.push(String(text)));

    await runCli(['node', 'aeos', 'ticket', 'show', '--json']);

    expect(process.exitCode).toBe(2);
    expect(JSON.parse(out.join('\n'))).toMatchObject({
      ok: false,
      command: 'ticket show',
      exit: 2,
      error: { code: 'USAGE', message: expect.stringContaining("missing required argument 'id'") },
    });
    expect(err).toHaveBeenCalled();
  });

  it('ticket list outside a project is missing_resource, naming project', async () => {
    projectRepo.findRoot.mockReturnValue(null);
    const execute = vi.fn();

    const ran = await cli({ ticketList: { execute } }, ['ticket', 'list', '--json']);

    expect(ran.exit).toBe(4);
    expect(ran.envelope()).toMatchObject({
      error: { code: 'RESOURCE_MISSING', resource: 'project' },
    });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('parameter checks', () => {
  it('refuses --executor nope as usage before anything is resolved', async () => {
    const run = ticketRun({});
    const inPlace = vi.fn();

    const ran = await cli({ ticketRun: run, ticketShow: { execute: inPlace } }, [
      'ticket',
      'run',
      'AEOS-1',
      '--executor',
      'nope',
      '--json',
    ]);

    expect(ran.exit).toBe(2);
    expect(ran.envelope()).toMatchObject({
      error: { code: 'INVALID_ARGUMENT', message: expect.stringContaining('--executor') },
    });
    expect(run.execute).not.toHaveBeenCalled();
    expect(inPlace).not.toHaveBeenCalled();
  });

  it.each([
    [['project', 'init', '--key', 'toolong'], '--key'],
    [['costs', '--since', 'yesterday'], '--since'],
    [['orchestrator', 'run', 'AEOS-1', '--budget', '0'], '--budget'],
    [['orchestrator', 'run', 'AEOS-1', '--max-steps', 'many'], '--max-steps'],
    [['ticket', 'create', 'T', '--implements', 'AC-1,nope'], '--implements'],
  ])('refuses %j as usage, naming the parameter', async (args, parameter) => {
    const ran = await cli({}, args);

    expect(ran.exit).toBe(2);
    expect(ran.err.join('\n')).toContain(`Error: ${parameter} must `);
  });
});

describe('prompts', () => {
  const silent: Prompt = { interactive: false, ask: vi.fn() };
  const answering = (...answers: string[]): Prompt => ({
    interactive: true,
    ask: vi.fn(async () => answers.shift() ?? ''),
  });

  it('ticket dod-approve without a terminal is needs_human and records nothing', async () => {
    const useCase = { review: vi.fn(), execute: vi.fn() };

    const ran = await cli(
      { ticketDodApprove: useCase },
      ['ticket', 'dod-approve', 'AEOS-1', '--json'],
      silent,
    );

    expect(ran.exit).toBe(3);
    expect(ran.envelope()).toMatchObject({ error: { code: 'CONFIRMATION_REQUIRED' }, data: null });
    expect(useCase.review).not.toHaveBeenCalled();
    expect(useCase.execute).not.toHaveBeenCalled();
    expect(silent.ask).not.toHaveBeenCalled();
  });

  it('ticket answer on an unmodified file without a terminal needs --yes', async () => {
    const execute = vi.fn((input: { confirmed?: boolean }) =>
      input.confirmed
        ? { ok: true, ticketId: 'AEOS-1', promoted: [], specPin: null }
        : { ok: false, needsConfirmation: true, reason: 'questions file not modified' },
    );

    const refused = await cli(
      { ticketAnswer: { execute } },
      ['ticket', 'answer', 'AEOS-1'],
      silent,
    );
    expect(refused.exit).toBe(2);
    expect(silent.ask).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);

    const confirmed = await cli(
      { ticketAnswer: { execute } },
      ['ticket', 'answer', 'AEOS-1', '--yes', '--json'],
      silent,
    );
    expect(confirmed.exit).toBe(0);
    expect(confirmed.envelope().data).toEqual({
      ticketId: 'AEOS-1',
      promoted: [],
      amendedDecisions: [],
      specPin: null,
    });
  });

  it('ticket resolve asks at a terminal, and --yes skips the question', async () => {
    const execute = vi.fn((input: { confirmed?: boolean }) =>
      input.confirmed
        ? { ok: true, ticketId: 'AEOS-1' }
        : { ok: false, needsConfirmation: true, reason: 'not modified' },
    );
    const person = answering('y');

    const asked = await cli(
      { ticketResolve: { execute } },
      ['ticket', 'resolve', 'AEOS-1'],
      person,
    );
    expect(person.ask).toHaveBeenCalledWith(
      'Warning: escalation file does not appear to have been modified. Continue anyway? [y/N] ',
    );
    expect(asked.exit).toBe(0);

    const skipped = answering();
    const yes = await cli(
      { ticketResolve: { execute } },
      ['ticket', 'resolve', 'AEOS-1', '--yes'],
      skipped,
    );
    expect(skipped.ask).not.toHaveBeenCalled();
    expect(yes.exit).toBe(0);

    const refused = await cli(
      { ticketResolve: { execute } },
      ['ticket', 'resolve', 'AEOS-1'],
      silent,
    );
    expect(refused.exit).toBe(2);
  });

  it('a command that asks under --json still writes one JSON object to stdout', async () => {
    const person = answering('y');
    const useCase = {
      review: vi.fn().mockResolvedValue({ ok: true, review: { report: null, prUrl: null } }),
      execute: vi.fn().mockReturnValue({
        status: 'approved',
        ticketId: 'AEOS-1',
        totalCostUsd: 2,
        gateRecordId: 'GATE-3',
      }),
    };

    const ran = await cli(
      { ticketDodApprove: useCase },
      ['ticket', 'dod-approve', 'AEOS-1', '--json'],
      person,
    );

    expect(person.ask).toHaveBeenCalledWith(expect.stringContaining('Approve ticket AEOS-1'));
    expect(ran.out).toHaveLength(1);
    expect(ran.envelope()).toMatchObject({
      ok: true,
      data: {
        ticketId: 'AEOS-1',
        approved: true,
        conformance: { pass: 0, fail: 0, unverified: 0, total: 0 },
        gateRecordId: 'GATE-3',
      },
    });
  });
});
