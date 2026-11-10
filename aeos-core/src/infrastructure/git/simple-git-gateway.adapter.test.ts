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

describe('SimpleGitGateway.diff', () => {
  let tmpDir: string;
  let gateway: SimpleGitGateway;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-git-diff-test-'));

    // Initialise a git repo
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], {
      cwd: tmpDir,
      stdio: 'ignore',
    });
    execFileSync('git', ['config', 'user.name', 'Test'], {
      cwd: tmpDir,
      stdio: 'ignore',
    });

    // Create an initial commit so HEAD exists
    const filePath = path.join(tmpDir, 'initial.md');
    fs.writeFileSync(filePath, 'initial content\n');
    execFileSync('git', ['add', '.'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir, stdio: 'ignore' });

    gateway = new SimpleGitGateway();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty string when there are no changes', () => {
    const result = gateway.diff(tmpDir);

    expect(result).toBe('');
  });

  it('returns diff content when files have been modified', () => {
    // Modify the tracked file
    fs.writeFileSync(path.join(tmpDir, 'initial.md'), 'modified content\n');

    const result = gateway.diff(tmpDir);

    expect(result).toContain('diff --git');
    expect(result).toContain('modified content');
  });
});

describe('SimpleGitGateway changed and restored files', () => {
  let repo: string;
  const gateway = new SimpleGitGateway();
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  };
  const write = (relative: string, content: string): void => {
    fs.mkdirSync(path.dirname(path.join(repo, relative)), { recursive: true });
    fs.writeFileSync(path.join(repo, relative), content);
  };

  beforeEach(() => {
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-git-test-')));
    git('init');
    git('config', 'user.email', 'test@test.com');
    git('config', 'user.name', 'Test');
    write('tracked.md', 'original\n');
    write('dir/staged.md', 'original\n');
    git('add', '.');
    git('commit', '-m', 'initial');
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('lists tracked modifications, staged changes and each untracked file', () => {
    expect(gateway.changedFiles(repo)).toEqual([]);

    write('tracked.md', 'edited\n');
    write('dir/staged.md', 'edited\n');
    git('add', 'dir/staged.md');
    write('new/deep/untracked.md', 'new\n');

    expect(gateway.changedFiles(repo).sort()).toEqual([
      'dir/staged.md',
      'new/deep/untracked.md',
      'tracked.md',
    ]);
  });

  it('reports paths relative to the directory when it is below the repository root', () => {
    write('dir/more.md', 'new\n');
    write('outside.md', 'new\n');

    expect(gateway.changedFiles(path.join(repo, 'dir'))).toEqual(['more.md']);
  });

  it('returns nothing outside a repository', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-plain-'));
    try {
      expect(gateway.changedFiles(plain)).toEqual([]);
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });

  it('restores tracked paths and deletes untracked and newly staged ones', () => {
    write('tracked.md', 'edited\n');
    write('dir/staged.md', 'edited\n');
    git('add', 'dir/staged.md');
    write('new/untracked.md', 'new\n');
    write('new/added.md', 'new\n');
    git('add', 'new/added.md');
    write('keep.md', 'not listed\n');

    gateway.restoreFiles(repo, ['tracked.md', 'dir/staged.md', 'new/untracked.md', 'new/added.md']);

    expect(fs.readFileSync(path.join(repo, 'tracked.md'), 'utf-8')).toBe('original\n');
    expect(fs.readFileSync(path.join(repo, 'dir/staged.md'), 'utf-8')).toBe('original\n');
    expect(fs.existsSync(path.join(repo, 'new/untracked.md'))).toBe(false);
    expect(fs.existsSync(path.join(repo, 'new/added.md'))).toBe(false);
    expect(gateway.changedFiles(repo)).toEqual(['keep.md']);
  });
});

describe('SimpleGitGateway branches and remotes', () => {
  let repo: string;
  const gateway = new SimpleGitGateway();
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  };

  beforeEach(() => {
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-git-test-')));
    git('init', '--initial-branch=master');
    git('config', 'user.email', 'test@test.com');
    git('config', 'user.name', 'Test');
    fs.writeFileSync(path.join(repo, 'a.md'), 'a\n');
    git('add', '.');
    git('commit', '-m', 'initial');
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('reads HEAD, and a file as it was at a commit', () => {
    const pinned = gateway.headCommit(repo);
    expect(pinned).toBe(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf-8' }).trim(),
    );

    fs.writeFileSync(path.join(repo, 'a.md'), 'edited\n');
    git('commit', '-am', 'edit');

    expect(gateway.showFile(repo, pinned, 'a.md')).toBe('a\n');
    expect(gateway.showFile(repo, gateway.headCommit(repo), 'a.md')).toBe('edited\n');
  });

  it('lists the files under a directory as they were at a commit', () => {
    fs.mkdirSync(path.join(repo, 'features', 'x', 'features'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'features', 'x', 'spec.md'), 'v1\n');
    fs.writeFileSync(path.join(repo, 'features', 'x', 'features', 'a.feature'), 'Feature: A\n');
    git('add', '.');
    git('commit', '-m', 'spec');
    const pinned = gateway.headCommit(repo);
    fs.writeFileSync(path.join(repo, 'features', 'x', 'features', 'b.feature'), 'Feature: B\n');
    git('add', '.');
    git('commit', '-m', 'later');

    expect(gateway.listFiles(repo, pinned, 'features/x')).toEqual([
      'features/x/features/a.feature',
      'features/x/spec.md',
    ]);
    expect(gateway.listFiles(repo, pinned, 'contexts/none')).toEqual([]);
    expect(() => gateway.listFiles(repo, 'deadbeef', 'features/x')).toThrow();
  });

  it('throws when the commit or the file cannot be read', () => {
    expect(() => gateway.showFile(repo, 'deadbeef', 'a.md')).toThrow();
    expect(() => gateway.showFile(repo, gateway.headCommit(repo), 'missing.md')).toThrow();
  });

  it('says whether a path changed after a commit, ignoring other paths', () => {
    fs.mkdirSync(path.join(repo, 'features', 'x'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'features', 'x', 'spec.md'), 'v1\n');
    git('add', '.');
    git('commit', '-m', 'spec');
    const pinned = gateway.headCommit(repo);

    fs.writeFileSync(path.join(repo, 'a.md'), 'elsewhere\n');
    git('commit', '-am', 'elsewhere');
    expect(gateway.pathChangedSince(repo, pinned, 'features/x')).toBe(false);

    fs.writeFileSync(path.join(repo, 'features', 'x', 'spec.md'), 'v2\n');
    git('commit', '-am', 'spec moved');
    expect(gateway.pathChangedSince(repo, pinned, 'features/x')).toBe(true);
  });

  it('reports the current branch', () => {
    expect(gateway.currentBranch(repo)).toBe('master');
    git('checkout', '-b', 'aeos/AEOS-1');
    expect(gateway.currentBranch(repo)).toBe('aeos/AEOS-1');
  });

  it('takes the default branch from the local branches when there is no remote', () => {
    expect(gateway.defaultBranch(repo)).toBe('master');
    git('branch', 'main');
    expect(gateway.defaultBranch(repo)).toBe('main');
  });

  it("prefers the remote's HEAD for the default branch", () => {
    // Set by hand: nothing is fetched from or pushed to anywhere.
    git('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');

    expect(gateway.defaultBranch(repo)).toBe('trunk');
  });

  it('knows whether a remote is configured, and is false outside a repository', () => {
    expect(gateway.hasRemote(repo)).toBe(false);
    git('remote', 'add', 'origin', 'https://example.invalid/nowhere.git');
    expect(gateway.hasRemote(repo)).toBe(true);
    expect(gateway.hasRemote(os.tmpdir())).toBe(false);
  });
});
