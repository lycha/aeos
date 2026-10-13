import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { artifactPath, writeArtifact, listArtifacts } from './fs-artifact-store.adapter.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-artifact-test-'));
  // Create .aeos/ so projectRoot() resolves to tmpDir
  fs.mkdirSync(path.join(tmpDir, '.aeos'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('artifactPath()', () => {
  it('constructs canonical path under .aeos/tickets/<ticketId>/', () => {
    const result = artifactPath('AEOS-1', 'prd.md', tmpDir);
    expect(result).toBe(path.join(tmpDir, '.aeos', 'tickets', 'AEOS-1', 'AEOS-1-prd.md'));
  });

  it('handles different artifact names', () => {
    const result = artifactPath('AEOS-1', 'ticket.md', tmpDir);
    expect(result).toBe(path.join(tmpDir, '.aeos', 'tickets', 'AEOS-1', 'AEOS-1-ticket.md'));
  });

  it('handles non-md extensions', () => {
    const result = artifactPath('AEOS-1', 'report.json', tmpDir);
    expect(result).toBe(path.join(tmpDir, '.aeos', 'tickets', 'AEOS-1', 'AEOS-1-report.json'));
  });

  it('rejects ticketId with path traversal', () => {
    expect(() => artifactPath('../../etc', 'passwd', tmpDir)).toThrow(/path separators/);
  });

  it('rejects artifactName with path traversal', () => {
    expect(() => artifactPath('AEOS-1', '../../../.env', tmpDir)).toThrow(/path separators/);
  });

  it('rejects ticketId containing path separator', () => {
    expect(() => artifactPath('foo/bar', 'prd.md', tmpDir)).toThrow(/path separators/);
  });
});

describe('writeArtifact()', () => {
  it('rejects artifactName with path traversal', () => {
    expect(() => writeArtifact('AEOS-1', '../../../.env', 'x', tmpDir)).toThrow(/path separators/);
  });

  it('writes content to the canonical artifact path', () => {
    const result = writeArtifact('AEOS-1', 'ticket.md', '# Ticket', tmpDir);
    const expected = path.join(tmpDir, '.aeos', 'tickets', 'AEOS-1', 'AEOS-1-ticket.md');
    expect(result).toBe(expected);
    expect(fs.readFileSync(expected, 'utf-8')).toBe('# Ticket');
  });

  it('auto-creates ticket directory when it does not exist', () => {
    const ticketDir = path.join(tmpDir, '.aeos', 'tickets', 'AEOS-2');
    expect(fs.existsSync(ticketDir)).toBe(false);

    writeArtifact('AEOS-2', 'prd.md', '# PRD', tmpDir);

    expect(fs.existsSync(ticketDir)).toBe(true);
    expect(fs.readFileSync(path.join(ticketDir, 'AEOS-2-prd.md'), 'utf-8')).toBe('# PRD');
  });

  it('returns the absolute path of the written file', () => {
    const result = writeArtifact('AEOS-1', 'prd.md', 'content', tmpDir);
    expect(path.isAbsolute(result)).toBe(true);
    expect(fs.existsSync(result)).toBe(true);
  });
});

describe('listArtifacts()', () => {
  it('rejects ticketId with path traversal', () => {
    expect(() => listArtifacts('../../etc', tmpDir)).toThrow(/path separators/);
  });

  it('returns all matching artifact paths for a ticket', () => {
    const ticketDir = path.join(tmpDir, '.aeos', 'tickets', 'AEOS-1');
    fs.mkdirSync(ticketDir, { recursive: true });
    fs.writeFileSync(path.join(ticketDir, 'AEOS-1-ticket.md'), 'ticket', 'utf-8');
    fs.writeFileSync(path.join(ticketDir, 'AEOS-1-prd.md'), 'prd', 'utf-8');

    const result = listArtifacts('AEOS-1', tmpDir);
    expect(result).toEqual([
      path.join(ticketDir, 'AEOS-1-prd.md'),
      path.join(ticketDir, 'AEOS-1-ticket.md'),
    ]);
  });

  it('includes non-.md files (no extension filter)', () => {
    const ticketDir = path.join(tmpDir, '.aeos', 'tickets', 'AEOS-1');
    fs.mkdirSync(ticketDir, { recursive: true });
    fs.writeFileSync(path.join(ticketDir, 'AEOS-1-report.json'), '{}', 'utf-8');

    const result = listArtifacts('AEOS-1', tmpDir);
    expect(result).toEqual([path.join(ticketDir, 'AEOS-1-report.json')]);
  });

  it('excludes files for other tickets', () => {
    // Create files for AEOS-1 and AEOS-2 in their own directories
    const dir1 = path.join(tmpDir, '.aeos', 'tickets', 'AEOS-1');
    const dir2 = path.join(tmpDir, '.aeos', 'tickets', 'AEOS-2');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(path.join(dir1, 'AEOS-1-prd.md'), 'prd1', 'utf-8');
    fs.writeFileSync(path.join(dir2, 'AEOS-2-prd.md'), 'prd2', 'utf-8');

    const result = listArtifacts('AEOS-1', tmpDir);
    expect(result).toEqual([path.join(dir1, 'AEOS-1-prd.md')]);
  });

  it('filters out files without the ticket prefix', () => {
    const ticketDir = path.join(tmpDir, '.aeos', 'tickets', 'AEOS-1');
    fs.mkdirSync(ticketDir, { recursive: true });
    fs.writeFileSync(path.join(ticketDir, 'AEOS-1-prd.md'), 'prd', 'utf-8');
    fs.writeFileSync(path.join(ticketDir, 'random-file.txt'), 'random', 'utf-8');

    const result = listArtifacts('AEOS-1', tmpDir);
    expect(result).toEqual([path.join(ticketDir, 'AEOS-1-prd.md')]);
  });

  it('returns empty array when ticket directory does not exist', () => {
    const result = listArtifacts('AEOS-99', tmpDir);
    expect(result).toEqual([]);
  });

  it('returns empty array when tickets/ parent directory does not exist', () => {
    // Fresh project — .aeos/ exists but no tickets/ subdirectory
    const result = listArtifacts('AEOS-1', tmpDir);
    expect(result).toEqual([]);
  });

  it('write + list round-trip works', () => {
    writeArtifact('AEOS-1', 'ticket.md', '# Ticket', tmpDir);
    writeArtifact('AEOS-1', 'prd.md', '# PRD', tmpDir);

    const result = listArtifacts('AEOS-1', tmpDir);
    expect(result).toHaveLength(2);
    expect(result).toEqual([
      artifactPath('AEOS-1', 'prd.md', tmpDir),
      artifactPath('AEOS-1', 'ticket.md', tmpDir),
    ]);
  });
});
