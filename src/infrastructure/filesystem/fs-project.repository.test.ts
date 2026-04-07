import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { projectRoot, aeosDir, readProjectConfig } from './fs-project.repository.js';
import {
  ProjectRootNotFoundError,
  ProjectConfigNotFoundError,
  ProjectConfigCorruptError,
} from '../../shared/errors.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('projectRoot()', () => {
  it('returns CWD when .aeos/ exists in the same directory', () => {
    fs.mkdirSync(path.join(tmpDir, '.aeos'), { recursive: true });
    expect(projectRoot(tmpDir)).toBe(tmpDir);
  });

  it('returns parent directory when .aeos/ exists in parent', () => {
    fs.mkdirSync(path.join(tmpDir, '.aeos'), { recursive: true });
    const child = path.join(tmpDir, 'sub');
    fs.mkdirSync(child);
    expect(projectRoot(child)).toBe(tmpDir);
  });

  it('returns grandparent directory when .aeos/ exists in grandparent', () => {
    fs.mkdirSync(path.join(tmpDir, '.aeos'), { recursive: true });
    const deep = path.join(tmpDir, 'a', 'b');
    fs.mkdirSync(deep, { recursive: true });
    expect(projectRoot(deep)).toBe(tmpDir);
  });

  it('throws ProjectRootNotFoundError when no .aeos/ exists', () => {
    expect(() => projectRoot(tmpDir)).toThrow(ProjectRootNotFoundError);
  });

  it('throws ProjectRootNotFoundError with max-depth message when depth exceeds 256', () => {
    // Build a path that is >256 levels deep (each segment is short)
    let deepPath = tmpDir;
    for (let i = 0; i < 260; i++) {
      deepPath = path.join(deepPath, 'd');
    }
    fs.mkdirSync(deepPath, { recursive: true });
    expect(() => projectRoot(deepPath)).toThrow('Max directory depth (256) exceeded');
  });
});

describe('aeosDir()', () => {
  it('returns path ending with /.aeos', () => {
    fs.mkdirSync(path.join(tmpDir, '.aeos'), { recursive: true });
    const result = aeosDir(tmpDir);
    expect(result).toBe(path.join(tmpDir, '.aeos'));
    expect(result.endsWith('/.aeos') || result.endsWith('\\.aeos')).toBe(true);
  });
});

describe('readProjectConfig()', () => {
  const validConfig = {
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    id: 'my-project',
    name: 'My Project',
    key: 'MP',
    path: '/some/path',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  it('returns a typed Project for a valid project.json', () => {
    const aeosPath = path.join(tmpDir, '.aeos');
    fs.mkdirSync(aeosPath, { recursive: true });
    fs.writeFileSync(
      path.join(aeosPath, 'project.json'),
      JSON.stringify(validConfig, null, 2),
      'utf-8',
    );
    const config = readProjectConfig(tmpDir);
    expect(config).toEqual(validConfig);
    expect(config.id).toBe('my-project');
    expect(config.key).toBe('MP');
    expect(config.name).toBe('My Project');
  });

  it('throws when project.json is missing', () => {
    const aeosPath = path.join(tmpDir, '.aeos');
    fs.mkdirSync(aeosPath, { recursive: true });
    expect(() => readProjectConfig(tmpDir)).toThrow(ProjectConfigNotFoundError);
  });

  it('throws when project.json contains invalid JSON', () => {
    const aeosPath = path.join(tmpDir, '.aeos');
    fs.mkdirSync(aeosPath, { recursive: true });
    fs.writeFileSync(path.join(aeosPath, 'project.json'), 'not valid json {{{', 'utf-8');
    expect(() => readProjectConfig(tmpDir)).toThrow(ProjectConfigCorruptError);
  });
});
