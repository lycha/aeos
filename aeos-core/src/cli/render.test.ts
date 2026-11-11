import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from './render.js';
import { done, failed, missingResource, stopped } from './result.js';

describe('render', () => {
  let out: string[];
  let err: string[];
  const setExit = vi.fn();

  beforeEach(() => {
    out = [];
    err = [];
    setExit.mockClear();
    vi.spyOn(console, 'log').mockImplementation((text) => void out.push(String(text)));
    vi.spyOn(console, 'error').mockImplementation((text) => void err.push(String(text)));
  });
  afterEach(() => vi.restoreAllMocks());

  it('writes text to stdout and each warning to stderr, and sets the exit code', () => {
    render(
      'ticket ready',
      done({ id: 1 }, '✓ done', [{ code: 'COST_UNKNOWN', message: 'no cost' }]),
      false,
      setExit,
    );

    expect(out).toEqual(['✓ done']);
    expect(err).toEqual(['Warning: no cost']);
    expect(setExit).toHaveBeenCalledWith(0);
  });

  it('writes an error as "Error: <message>" to stderr', () => {
    render('ticket ready', failed(new Error('Ticket AEOS-9 not found')), false, setExit);

    expect(out).toEqual([]);
    expect(err).toEqual(['Error: Ticket AEOS-9 not found']);
    expect(setExit).toHaveBeenCalledWith(1);
  });

  it('with --json writes exactly one envelope to stdout and nothing else', () => {
    render('ticket ready', done({ ticketId: 'AEOS-1' }, '✓ done'), true, setExit);

    expect(err).toEqual([]);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0])).toEqual({
      ok: true,
      command: 'ticket ready',
      exit: 0,
      contractVersion: 1,
      data: { ticketId: 'AEOS-1' },
      error: null,
      warnings: [],
    });
  });

  it('with --json reports a failure with a stable code and no stack trace', () => {
    render('ticket ready', failed(new Error('Ticket AEOS-9 not found')), true, setExit);

    const envelope = JSON.parse(out[0]) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      ok: false,
      exit: 1,
      data: null,
      error: { code: 'TICKET_NOT_FOUND', message: 'Ticket AEOS-9 not found', resource: null },
    });
    expect(out[0]).not.toContain('    at ');
  });

  it('names the resource exactly when one is missing', () => {
    render('ticket list', missingResource('project'), true, setExit);

    expect(JSON.parse(out[0])).toMatchObject({
      exit: 4,
      error: { code: 'RESOURCE_MISSING', resource: 'project' },
    });
    expect(setExit).toHaveBeenCalledWith(4);
  });

  it('keeps a stop that is not an error on stdout when the command says so', () => {
    const result = stopped('gate-refused', 'HUMAN_GATE', 'A person decides.', {
      text: '✓ AEOS-1 — HUMAN_GATE',
      stream: 'stdout',
    });

    render('orchestrator run', result, false, setExit);

    expect(out).toEqual(['✓ AEOS-1 — HUMAN_GATE']);
    expect(setExit).toHaveBeenCalledWith(3);
  });
});

describe('failed', () => {
  it.each([
    ['Ticket AEOS-1 is not signed off (current state: READY).', 'NOT_SIGNED_OFF', 1, null],
    [
      'The TASK pipeline in .aeos/pipelines.yaml changed while tickets are in flight: AEOS-2 (QA).',
      'PIPELINE_CHANGE_IN_FLIGHT',
      3,
      null,
    ],
    [
      'python3 is not on PATH. It is needed to run lint_decisions.py.',
      'RESOURCE_MISSING',
      4,
      'python',
    ],
    // `gh` found by the guard, but not logged in.
    [
      'Cannot open a pull request for AEOS-1: `gh` is not authenticated. Run `gh auth login`.',
      'RESOURCE_MISSING',
      4,
      'gh',
    ],
    // Not reachable from a person's approve any more: the guard answers first.
    [
      'Cannot open a pull request for AEOS-1: the `gh` command is not on PATH.',
      'PULL_REQUEST_FAILED',
      1,
      null,
    ],
    ['Something nobody planned for', 'COMMAND_FAILED', 1, null],
  ])('classifies "%s" as %s', (message, code, exit, resource) => {
    const result = failed(message);

    expect(result.exit).toBe(exit);
    expect(result.error).toEqual({ code, message, resource });
  });
});
