// Adapter — simple-git implementation of GitGateway port

import { execFileSync } from 'node:child_process';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';

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
}
