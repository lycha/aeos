// Adapter — PullRequestGateway through the GitHub CLI (decision D4: no API client)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  PullRequestGateway,
  PullRequestRequest,
} from '../../domain/ports/driven/pull-request-gateway.port.js';

/** Runs a command and returns its stdout; throws when it cannot start or exits non-zero. */
export type CommandRunner = (command: string, args: string[], cwd: string) => string;

const spawn: CommandRunner = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });

export class GhPullRequestGateway implements PullRequestGateway {
  /** The runner is replaceable so tests never start `gh`. */
  constructor(private readonly run: CommandRunner = spawn) {}

  isAvailable(cwd: string): { ok: boolean; reason?: string } {
    if (!this.succeeds('gh', ['--version'], cwd)) {
      return {
        ok: false,
        reason:
          'the `gh` command is not on PATH. Install the GitHub CLI (https://cli.github.com), then run `gh auth login`.',
      };
    }
    if (!this.succeeds('gh', ['auth', 'status'], cwd)) {
      return { ok: false, reason: '`gh` is not authenticated. Run `gh auth login`.' };
    }
    let remotes = '';
    try {
      remotes = this.run('git', ['remote'], cwd);
    } catch {
      // not a repository: no remote either
    }
    if (remotes.trim() === '') {
      return {
        ok: false,
        reason: 'the repository has no remote. Add one with `git remote add origin <url>`.',
      };
    }
    return { ok: true };
  }

  create(request: PullRequestRequest): { url: string } {
    // `gh pr create` fails when the head branch already has an open pull request.
    const existing = this.openPullRequestUrl(request);
    if (existing) return { url: existing };

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-pr-'));
    const bodyFile = path.join(dir, 'body.md');
    try {
      fs.writeFileSync(bodyFile, request.body, 'utf-8');
      const output = this.run(
        'gh',
        [
          'pr',
          'create',
          '--base',
          request.base,
          '--head',
          request.head,
          '--title',
          request.title,
          '--body-file',
          bodyFile,
        ],
        request.cwd,
      );
      // gh prints the new pull request's URL as its last line.
      return { url: output.trim().split('\n').pop() ?? '' };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  private openPullRequestUrl(request: PullRequestRequest): string | null {
    try {
      const found = JSON.parse(
        this.run('gh', ['pr', 'view', request.head, '--json', 'url,state'], request.cwd),
      ) as { url?: string; state?: string };
      return found.state === 'OPEN' && found.url ? found.url : null;
    } catch {
      return null; // no pull request for the branch
    }
  }

  private succeeds(command: string, args: string[], cwd: string): boolean {
    try {
      this.run(command, args, cwd);
      return true;
    } catch {
      return false;
    }
  }
}
