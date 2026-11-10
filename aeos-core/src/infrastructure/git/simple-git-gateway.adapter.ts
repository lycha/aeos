// Adapter — GitGateway implementation using execFileSync (no async, no simple-git dep)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';

export class SimpleGitGateway implements GitGateway {
  init(dir: string): void {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  }

  commit(dir: string, message: string): void {
    execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
    try {
      execFileSync('git', ['commit', '-m', message, '--allow-empty'], {
        cwd: dir,
        stdio: 'ignore',
      });
    } catch {
      // nothing to commit — safe to ignore
    }
  }

  commitFiles(dir: string, files: string[], message: string): void {
    if (files.length === 0) return;

    // Validate all files are inside dir
    const resolvedDir = fs.realpathSync(dir);
    for (const file of files) {
      let resolved: string;
      try {
        resolved = fs.realpathSync(path.resolve(file));
      } catch {
        throw new Error(`Git commit failed: file "${file}" does not exist`);
      }
      if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
        throw new Error(`Git commit failed: file "${file}" is outside "${dir}"`);
      }
    }

    execFileSync('git', ['add', ...files], { cwd: dir, stdio: 'ignore' });
    try {
      execFileSync('git', ['commit', '-m', message], { cwd: dir, stdio: 'ignore' });
    } catch {
      // nothing to commit — safe to ignore
    }
  }

  stageAll(dir: string): void {
    execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  }

  commitAll(dir: string, message: string): boolean {
    this.stageAll(dir);
    // `git diff --cached --quiet` exits 1 when something is staged. Checking
    // first keeps us from creating an empty commit in a user's source repo.
    try {
      execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: dir, stdio: 'ignore' });
      return false; // nothing staged — clean tree
    } catch {
      // non-zero exit means there are staged changes
    }

    try {
      execFileSync('git', ['commit', '-m', message], { cwd: dir, stdio: 'ignore' });
      return true;
    } catch {
      // A commit can still fail (e.g. a hook rejects it). Do not break the run
      // over it — the changes remain staged and the pipeline continues.
      return false;
    }
  }

  diff(dir: string): string {
    return execFileSync('git', ['diff', 'HEAD'], { cwd: dir, encoding: 'utf-8' });
  }

  isRepo(dir: string): boolean {
    try {
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  ensureOnBranch(dir: string, name: string): void {
    const current = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: dir,
      encoding: 'utf-8',
    }).trim();
    if (current === name) return;

    if (this.refExists(dir, `refs/heads/${name}`)) {
      execFileSync('git', ['checkout', name], { cwd: dir, stdio: 'ignore' });
    } else {
      // Create from current HEAD, carrying any uncommitted work with us.
      execFileSync('git', ['checkout', '-b', name], { cwd: dir, stdio: 'ignore' });
    }
  }

  tagHere(dir: string, name: string): void {
    if (this.refExists(dir, `refs/tags/${name}`)) return;
    execFileSync('git', ['tag', name], { cwd: dir, stdio: 'ignore' });
  }

  diffRange(dir: string, from: string, to: string): string {
    return execFileSync('git', ['diff', from, to], { cwd: dir, encoding: 'utf-8' });
  }

  refExists(dir: string, ref: string): boolean {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: dir, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  changedFiles(dir: string): string[] {
    const git = (...args: string[]): string =>
      execFileSync('git', args, {
        cwd: dir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    // Status paths are relative to the repository root, not to `dir`.
    let prefix: string;
    try {
      prefix = git('rev-parse', '--show-prefix').trim();
    } catch {
      return []; // not a repository
    }
    const fields = git('status', '--porcelain', '-z', '--untracked-files=all', '--', '.').split(
      '\0',
    );
    const files: string[] = [];
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i];
      if (field.length < 4) continue;
      files.push(field.slice(3));
      // A rename or copy is followed by its source path as a field of its own.
      if (/[RC]/.test(field.slice(0, 2))) files.push(fields[++i]);
    }
    return files.filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length));
  }

  restoreFiles(dir: string, paths: string[]): void {
    for (const file of paths) {
      try {
        execFileSync('git', ['checkout', 'HEAD', '--', file], { cwd: dir, stdio: 'ignore' });
      } catch {
        // Not in HEAD: the path is new, so restoring it means removing it.
        execFileSync('git', ['rm', '--cached', '--quiet', '--ignore-unmatch', '--', file], {
          cwd: dir,
          stdio: 'ignore',
        });
        fs.rmSync(path.join(dir, file), { force: true });
      }
    }
  }
}
