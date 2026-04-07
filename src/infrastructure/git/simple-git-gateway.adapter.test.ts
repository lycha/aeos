import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { SimpleGitGateway } from './simple-git-gateway.adapter.js';

describe('SimpleGitGateway.commitFiles', () => {
  let tmpDir: string;
  let aeosPath: string;
  let gateway: SimpleGitGateway;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-git-test-'));
    aeosPath = path.join(tmpDir, '.aeos');
    fs.mkdirSync(aeosPath, { recursive: true });

    // Initialise a git repo in .aeos/
    execFileSync('git', ['init'], { cwd: aeosPath, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], {
      cwd: aeosPath,
      stdio: 'ignore',
    });
    execFileSync('git', ['config', 'user.name', 'Test'], {
      cwd: aeosPath,
      stdio: 'ignore',
    });

    gateway = new SimpleGitGateway();

    // Change cwd so projectRoot() finds our temp .aeos/
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create a commit for a new file', () => {
    const filePath = path.join(aeosPath, 'ticket.md');
    fs.writeFileSync(filePath, '# Ticket\n');

    gateway.commitFiles(aeosPath, [filePath], '[AEOS-1][TICKET][v1][human][create]');

    const log = execFileSync('git', ['log', '--oneline'], {
      cwd: aeosPath,
      encoding: 'utf-8',
    });
    expect(log.trim()).toMatch(/\S+/); // at least one commit
  });

  it('should store the commit message verbatim', () => {
    const filePath = path.join(aeosPath, 'ticket.md');
    fs.writeFileSync(filePath, '# Ticket\n');

    const message = '[AEOS-1][TICKET][v1][human][create]';
    gateway.commitFiles(aeosPath, [filePath], message);

    const log = execFileSync('git', ['log', '--format=%s', '-1'], {
      cwd: aeosPath,
      encoding: 'utf-8',
    });
    expect(log.trim()).toBe(message);
  });

  it('should not error on empty diff (nothing to commit)', () => {
    const filePath = path.join(aeosPath, 'ticket.md');
    fs.writeFileSync(filePath, '# Ticket\n');

    // First commit
    gateway.commitFiles(aeosPath, [filePath], 'first');

    // Second commit with same content — should not throw
    expect(() => gateway.commitFiles(aeosPath, [filePath], 'second')).not.toThrow();

    // Verify only 1 commit exists (no empty commit created)
    const log = execFileSync('git', ['log', '--oneline'], {
      cwd: aeosPath,
      encoding: 'utf-8',
    });
    const commits = log.trim().split('\n').filter(Boolean);
    expect(commits).toHaveLength(1);
  });

  it('should throw an error for files outside the dir', () => {
    const outsideFile = path.join(tmpDir, 'outside.txt');
    fs.writeFileSync(outsideFile, 'outside\n');

    expect(() => gateway.commitFiles(aeosPath, [outsideFile], 'bad')).toThrow(/outside/);
  });

  it('should throw a descriptive error for a corrupt .git', () => {
    const filePath = path.join(aeosPath, 'ticket.md');
    fs.writeFileSync(filePath, '# Ticket\n');

    // Corrupt the git repo by deleting .git
    fs.rmSync(path.join(aeosPath, '.git'), { recursive: true, force: true });

    expect(() => gateway.commitFiles(aeosPath, [filePath], 'msg')).toThrow();
  });

  it('should commit multiple files at once', () => {
    const file1 = path.join(aeosPath, 'file1.md');
    const file2 = path.join(aeosPath, 'file2.md');
    fs.writeFileSync(file1, 'content 1\n');
    fs.writeFileSync(file2, 'content 2\n');

    gateway.commitFiles(aeosPath, [file1, file2], 'multi');

    const log = execFileSync('git', ['log', '--oneline'], {
      cwd: aeosPath,
      encoding: 'utf-8',
    });
    expect(log.trim().split('\n')).toHaveLength(1);

    // Both files should be tracked
    const files = execFileSync('git', ['ls-files'], {
      cwd: aeosPath,
      encoding: 'utf-8',
    });
    expect(files).toContain('file1.md');
    expect(files).toContain('file2.md');
  });
});
