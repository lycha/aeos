import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GateRecord } from '../../domain/model/gate-record.js';
import { SimpleGitGateway } from '../git/simple-git-gateway.adapter.js';
import { FsArtefactTree } from './fs-artefact-tree.adapter.js';
import { FsGateRecordStore } from './fs-gate-record-store.adapter.js';

const validateGates = new Ajv2020({
  // shortcut: one format in use, so a pattern instead of the ajv-formats package.
  formats: { 'date-time': /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/ },
}).compile(
  JSON.parse(
    fs.readFileSync(
      path.resolve(
        import.meta.dirname,
        '../../../../plugins/artefact-tree-pipeline/schemas/gates.schema.json',
      ),
      'utf-8',
    ),
  ) as object,
);

const PIN = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };

function decision(overrides: Partial<Omit<GateRecord, 'id'>> = {}): Omit<GateRecord, 'id'> {
  return {
    gate: 'column-approval',
    ticket: 'AEOS-1',
    column: 'TECH_SPEC',
    from_column: 'TECH_SPEC',
    to_column: 'TASK_BREAKDOWN',
    decided_by: 'Test <test@test.com>',
    decided_at: '2026-11-10T10:00:00.000Z',
    verdict: 'approved',
    overrides: null,
    evidence: [],
    spec_pin: null,
    ...overrides,
  };
}

describe('FsGateRecordStore', () => {
  let projectPath: string;
  let aeosDir: string;
  const store = new FsGateRecordStore(new FsArtefactTree(), new SimpleGitGateway());
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: aeosDir, encoding: 'utf-8' });
  const load = (relative: string): unknown =>
    yaml.load(fs.readFileSync(path.join(aeosDir, relative), 'utf-8'));

  beforeEach(() => {
    projectPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-gates-')));
    aeosDir = path.join(projectPath, '.aeos');
    fs.mkdirSync(path.join(aeosDir, 'features', 'checkout'), { recursive: true });
    fs.writeFileSync(path.join(aeosDir, 'features', 'checkout', 'spec.md'), '# Spec\n');
    git('init');
    git('config', 'user.email', 'test@test.com');
    git('config', 'user.name', 'Test');
    git('add', '.');
    git('commit', '-m', 'initial');
  });

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it("appends a spec-backed ticket's decisions to its feature, numbered, valid and committed", () => {
    const file = path.join(aeosDir, 'features', 'checkout', 'gates.yaml');

    const first = store.append(projectPath, decision({ gate: 'spec', spec_pin: PIN }));
    const afterFirst = fs.readFileSync(file, 'utf-8');
    const second = store.append(
      projectPath,
      decision({
        gate: 'move-override',
        verdict: 'overridden',
        reason: 'The review is wrong about AC-2.',
        ticket: 'AEOS-2',
        spec_pin: PIN,
      }),
    );

    expect([first.id, second.id]).toEqual(['GATE-1', 'GATE-2']);
    // Appended to, not rewritten.
    expect(fs.readFileSync(file, 'utf-8').startsWith(afterFirst)).toBe(true);
    const document = load('features/checkout/gates.yaml') as { records: GateRecord[] };
    expect(validateGates(document), JSON.stringify(validateGates.errors)).toBe(true);
    expect(document).toMatchObject({ schema_version: 0, feature: 'checkout' });
    expect(document.records).toEqual([first, second]);
    expect(git('status', '--porcelain')).toBe('');
    expect(
      git('log', '--format=%s', '--', 'features/checkout/gates.yaml').trim().split('\n'),
    ).toHaveLength(2);
  });

  it("keeps the decisions of a ticket with no spec in the ticket's own directory", () => {
    const record = store.append(projectPath, decision({ ticket: 'AEOS-7' }));

    expect(record.id).toBe('GATE-1');
    const document = load('tickets/AEOS-7/AEOS-7-gates.yaml');
    expect(validateGates(document), JSON.stringify(validateGates.errors)).toBe(true);
    expect(document).toMatchObject({ feature: null, records: [record] });
    expect(git('status', '--porcelain')).toBe('');
  });

  it('lists by feature and by ticket', () => {
    const a = store.append(projectPath, decision({ spec_pin: PIN }));
    const b = store.append(projectPath, decision({ ticket: 'AEOS-2', spec_pin: PIN }));
    const c = store.append(projectPath, decision({ ticket: 'AEOS-7' }));

    expect(store.list(projectPath, { feature: 'checkout' })).toEqual([a, b]);
    expect(store.list(projectPath, { ticketId: 'AEOS-2' })).toEqual([b]);
    expect(store.list(projectPath, { ticketId: 'AEOS-7' })).toEqual([c]);
    expect(store.list(projectPath)).toEqual([a, b, c]);
  });

  it('throws and leaves the file as it was when the record cannot be committed', () => {
    const first = store.append(projectPath, decision({ spec_pin: PIN }));
    const failing = new FsGateRecordStore(new FsArtefactTree(), {
      ...Object.create(SimpleGitGateway.prototype),
      commitFiles: () => {
        throw new Error('index is locked');
      },
    });

    expect(() => failing.append(projectPath, decision({ spec_pin: PIN }))).toThrow(
      'index is locked',
    );
    expect(store.list(projectPath, { feature: 'checkout' })).toEqual([first]);
  });
});
