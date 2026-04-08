// Adapter — Claude CLI (child_process) implementation of Executor port

import { type ChildProcess, execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';
import type { ExecutorResult } from '../../domain/model/executor-result.js';
import type { Executor } from '../../domain/ports/driven/executor.port.js';

/** Configuration for the Claude CLI executor. */
export interface ClaudeCliExecutorConfig {
  /** Model identifier passed as --model flag (e.g. 'claude-opus-4-6'). */
  model?: string;
  /** Maximum output tokens passed as --max-tokens flag. */
  maxTokens?: number;
  /** Timeout in milliseconds before killing the process (default: 300 000). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;

export class ClaudeCodeCliExecutor implements Executor {
  private runningProcess: ChildProcess | null = null;
  private interrupted = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly config: ClaudeCliExecutorConfig = {}) {}

  async run(invocation: ExecutorInvocation): Promise<ExecutorResult> {
    const args = this.buildArgs();
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.interrupted = false;

    return new Promise<ExecutorResult>((resolve) => {
      let timedOut = false;

      const child = execFile('claude', args, { timeout: 0 }, async (error, stdout, stderr) => {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        this.runningProcess = null;

        if (timedOut) {
          resolve({ ok: false, reason: `Executor timeout after ${Math.round(timeoutMs / 1000)}s` });
          return;
        }

        if (this.interrupted) {
          resolve({ ok: false, reason: 'Execution interrupted by operator' });
          return;
        }

        if (error) {
          // ENOENT means the claude binary was not found on PATH
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            resolve({ ok: false, reason: 'claude CLI not found on PATH' });
            return;
          }

          // Non-zero exit code or other error
          resolve({ ok: false, reason: stderr || error.message });
          return;
        }

        // Success — write output to disk
        // outputPath is constructed by the application layer — trusted input
        try {
          await fs.mkdir(path.dirname(invocation.outputPath), { recursive: true });
          await fs.writeFile(invocation.outputPath, stdout, 'utf8');
          // TODO(M2-007): Parse usage from Claude CLI JSON output mode when available
          resolve({ ok: true, artifactPath: invocation.outputPath, content: stdout });
        } catch (writeErr) {
          resolve({
            ok: false,
            reason: `Failed to write artifact: ${(writeErr as Error).message}`,
          });
        }
      });

      this.runningProcess = child;

      // Pipe prompt via stdin
      if (child.stdin) {
        child.stdin.write(invocation.prompt);
        child.stdin.end();
      }

      // Timeout handler
      this.timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
    });
  }

  async interrupt(): Promise<void> {
    if (this.runningProcess) {
      this.interrupted = true;
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.runningProcess.kill('SIGTERM');
      this.runningProcess = null;
    }
  }

  /** Build the CLI arguments array. */
  private buildArgs(): string[] {
    const args = ['--print', '-'];

    if (this.config.model) {
      args.push('--model', this.config.model);
    }
    if (this.config.maxTokens !== undefined) {
      args.push('--max-tokens', String(this.config.maxTokens));
    }

    return args;
  }
}
