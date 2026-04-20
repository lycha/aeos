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
const TIMEOUT_OUTPUT_PREVIEW_LIMIT = 2_000;
const PROMPT_PREVIEW_LIMIT = 1_000;

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
      let stdout = '';
      let stderr = '';
      let settled = false;

      const finalize = (result: ExecutorResult): void => {
        if (settled) return;
        settled = true;
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        this.runningProcess = null;
        resolve(result);
      };

      const child = execFile('claude', args, { timeout: 0 });

      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
      });

      child.once('error', (error) => {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
          finalize({ ok: false, reason: 'claude CLI not found on PATH' });
          return;
        }

        finalize({ ok: false, reason: stderr || err.message });
      });

      child.once('close', async (code, signal) => {
        if (settled) {
          return;
        }

        if (timedOut) {
          finalize({
            ok: false,
            reason: this.buildTimeoutReason(timeoutMs, stdout, stderr),
          });
          return;
        }

        if (this.interrupted) {
          finalize({ ok: false, reason: 'Execution interrupted by operator' });
          return;
        }

        if (signal) {
          finalize({ ok: false, reason: stderr || `claude process exited with signal ${signal}` });
          return;
        }

        if (code !== 0) {
          finalize({
            ok: false,
            reason: stderr || `claude exited with code ${code ?? 'unknown'}`,
          });
          return;
        }

        // Success — write output to disk
        // outputPath is constructed by the application layer — trusted input
        try {
          await fs.mkdir(path.dirname(invocation.outputPath), { recursive: true });
          await fs.writeFile(invocation.outputPath, stdout, 'utf8');
          // TODO(M2-007): Parse usage from Claude CLI JSON output mode when available
          finalize({ ok: true, artifactPath: invocation.outputPath, content: stdout });
        } catch (writeErr) {
          finalize({
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
        this.logTimeoutDiagnostics(invocation, args, timeoutMs, stdout, stderr);
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

  private buildTimeoutReason(timeoutMs: number, stdout: string, stderr: string): string {
    const seconds = Math.ceil(timeoutMs / 1000);
    return [
      `Executor timeout after ${seconds}s`,
      this.formatCapturedOutput('Partial stdout', stdout),
      this.formatCapturedOutput('Partial stderr', stderr),
    ].join('\n\n');
  }

  private formatCapturedOutput(label: string, text: string): string {
    if (text.length === 0) {
      return `${label}: (no output captured)`;
    }

    if (text.length <= TIMEOUT_OUTPUT_PREVIEW_LIMIT) {
      return `${label}:\n${text}`;
    }

    return `${label} (showing last ${TIMEOUT_OUTPUT_PREVIEW_LIMIT} chars of ${text.length}):\n${text.slice(-TIMEOUT_OUTPUT_PREVIEW_LIMIT)}`;
  }

  private logTimeoutDiagnostics(
    invocation: ExecutorInvocation,
    args: string[],
    timeoutMs: number,
    stdout: string,
    stderr: string,
  ): void {
    const promptPreview = invocation.prompt.slice(0, PROMPT_PREVIEW_LIMIT);
    const message = [
      '[ClaudeCodeCliExecutor timeout diagnostics]',
      `ticketId: ${invocation.ticketId}`,
      `column: ${invocation.column}`,
      `timeoutMs: ${timeoutMs}`,
      `command: claude`,
      `args: ${JSON.stringify(args)}`,
      'promptPreview:',
      promptPreview,
      this.formatCapturedOutput('stdoutPreview', stdout),
      this.formatCapturedOutput('stderrPreview', stderr),
    ].join('\n');

    process.stderr.write(`${message}\n`);
  }
}
