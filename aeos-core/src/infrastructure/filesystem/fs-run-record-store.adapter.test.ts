import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { RunRecord } from '../../domain/model/run-record.js';
import { FsRunRecordStore } from './fs-run-record-store.adapter.js';

function record(runId: string): RunRecord {
  return {
    schema_version: 0,
    run_id: runId,
    project: 'p',
    ticket: 'AEOS-1',
    column: 'TECH_SPEC',
    role: 'worker',
    agent: 'architect',
    attempt: 1,
    executor: 'stub',
    model: null,
    mode: 'artifact',
    brief: { path: `tickets/AEOS-1/runs/${runId}.brief.md`, sha256: 'a'.repeat(64) },
    output: null,
    transcript: `tickets/AEOS-1/runs/${runId}.log`,
    verdict: null,
    started_at: '2026-11-10T10:00:00.000Z',
    ended_at: '2026-11-10T10:00:01.000Z',
    duration_ms: 1000,
    exit: 'ok',
    usage: null,
    cost_usd: null,
    cost_basis: 'unknown',
    spec_pin: null,
    error: null,
  };
}

describe('FsRunRecordStore', () => {
  let tmpDir: string;
  const store = new FsRunRecordStore();

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-run-record-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes the record, the brief and the log, and returns their paths', () => {
    const runs = path.join(tmpDir, '.aeos', 'tickets', 'AEOS-1', 'runs');

    const files = store.write(tmpDir, record('RUN-1'), { brief: 'the prompt', transcript: 'raw' });

    expect(files).toEqual([
      path.join(runs, 'RUN-1.json'),
      path.join(runs, 'RUN-1.brief.md'),
      path.join(runs, 'RUN-1.log'),
    ]);
    expect(JSON.parse(fs.readFileSync(files[0]!, 'utf-8'))).toEqual(record('RUN-1'));
    expect(fs.readFileSync(files[1]!, 'utf-8')).toBe('the prompt');
    expect(fs.readFileSync(files[2]!, 'utf-8')).toBe('raw');
  });

  it('writes no brief file for a run that had no prompt', () => {
    const runs = path.join(tmpDir, '.aeos', 'tickets', 'AEOS-1', 'runs');

    const files = store.write(tmpDir, { ...record('RUN-2'), brief: null }, { transcript: 'raw' });

    expect(files).toEqual([path.join(runs, 'RUN-2.json'), path.join(runs, 'RUN-2.log')]);
    expect(fs.existsSync(path.join(runs, 'RUN-2.brief.md'))).toBe(false);
  });

  it('lists the records of a ticket, oldest first', () => {
    store.write(tmpDir, record('RUN-20261110T100001Z-aaaa'), { brief: 'b', transcript: 't' });
    store.write(tmpDir, record('RUN-20261110T100000Z-zzzz'), { brief: 'b', transcript: 't' });

    expect(store.list(tmpDir, 'AEOS-1').map((r) => r.run_id)).toEqual([
      'RUN-20261110T100000Z-zzzz',
      'RUN-20261110T100001Z-aaaa',
    ]);
  });

  it('lists nothing for a ticket that has never run', () => {
    expect(store.list(tmpDir, 'AEOS-2')).toEqual([]);
  });

  it('rejects a ticket id that would escape the tickets directory', () => {
    expect(() => store.list(tmpDir, '../x')).toThrow(/path separators/);
  });
});
