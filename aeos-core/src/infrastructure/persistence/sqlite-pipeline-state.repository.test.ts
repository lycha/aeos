import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDb, resetDb, _testing } from './database.js';
import { SqlitePipelineStateRepository } from './sqlite-pipeline-state.repository.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-pipeline-state-test-'));
  vi.stubEnv('AEOS_HOME', tmpDir);
});

afterEach(() => {
  resetDb();
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SqlitePipelineStateRepository', () => {
  it('has nothing for a project it has not seen', () => {
    expect(new SqlitePipelineStateRepository(getDb()).find('p', 'TASK')).toBeNull();
  });

  it('keeps the accepted columns of each kind of each project, replacing on save', () => {
    const repo = new SqlitePipelineStateRepository(getDb());
    repo.save('p', 'TASK', ['BACKLOG', 'QA', 'DONE'], '2026-11-11T10:00:00.000Z');
    repo.save('p', 'EPIC', ['BACKLOG', 'DONE'], '2026-11-11T10:00:00.000Z');
    repo.save('p', 'TASK', ['BACKLOG', 'DONE'], '2026-11-11T11:00:00.000Z');

    expect(repo.find('p', 'TASK')).toEqual(['BACKLOG', 'DONE']);
    expect(repo.find('p', 'EPIC')).toEqual(['BACKLOG', 'DONE']);
    expect(repo.find('other', 'TASK')).toBeNull();
    expect(
      getDb().prepare('SELECT accepted_at FROM pipeline_state WHERE kind = ?').get('TASK'),
    ).toEqual({ accepted_at: '2026-11-11T11:00:00.000Z' });
  });

  it('is created by a migration that can run twice (v13)', () => {
    const db = getDb();
    _testing.MIGRATIONS.find((migration) => migration.version === 13)!.apply(db);

    expect(new SqlitePipelineStateRepository(db).find('p', 'TASK')).toBeNull();
  });
});
