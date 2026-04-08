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

  diff(dir: string): string {
    return execFileSync('git', ['diff', 'HEAD'], { cwd: dir, encoding: 'utf-8' });
  }
}
