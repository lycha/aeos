// Adapter — simple-git implementation of GitGateway port

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { simpleGit } from 'simple-git';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import { aeosDir } from '../filesystem/fs-project.repository.js';

export class SimpleGitGateway implements GitGateway {
  init(dir: string): void {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  }

  commit(dir: string, message: string): void {
    execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', message, '--allow-empty'], {
      cwd: dir,
      stdio: 'ignore',
    });
  }

  async commitFiles(message: string, files: string[], root?: string): Promise<void> {
    if (files.length === 0) return;

    const aeos = aeosDir(root);

    // Validate all files are inside .aeos/
    // Use realpathSync to resolve symlinks (e.g. /var → /private/var on macOS)
    const resolvedAeos = fs.realpathSync(aeos);
    for (const file of files) {
      let resolved: string;
      try {
        resolved = fs.realpathSync(path.resolve(file));
      } catch {
        throw new Error(`Git commit failed in .aeos/: file "${file}" does not exist`);
      }
      if (!resolved.startsWith(resolvedAeos + path.sep) && resolved !== resolvedAeos) {
        throw new Error(
          `Git commit failed in .aeos/: file "${file}" is outside the .aeos/ directory`,
        );
      }
    }

    const git = simpleGit({ baseDir: aeos });

    try {
      await git.add(files);
      await git.commit(message);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('nothing to commit')) {
        return;
      }
      const originalMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Git commit failed in .aeos/: ${originalMessage}`);
    }
  }
}
