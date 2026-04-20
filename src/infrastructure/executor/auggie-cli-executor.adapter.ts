// Adapter — Auggie CLI (child_process) implementation of Executor port

import { type ChildProcess, execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';
import type { ExecutorResult } from '../../domain/model/executor-result.js';
import type { Executor } from '../../domain/ports/driven/executor.port.js';

/** Configuration for the Auggie CLI executor. */
export interface AuggieCliExecutorConfig {
  /** Model identifier passed as --model flag (e.g. 'claude-opus-4-6'). */
  model?: string;
  /** Timeout in milliseconds before killing the process (default: 300 000). */
  timeoutMs?: number;
  /** Maximum number of agentic turns in print mode (default: 12). */
  maxTurns?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;
const TIMEOUT_OUTPUT_PREVIEW_LIMIT = 2_000;
const PROMPT_PREVIEW_LIMIT = 1_000;
const DEFAULT_AGENTIC_MAX_TURNS = 12;
const AUGGIE_AGENTIC_ALLOWED_TOOLS = [
  'view',
  'codebase-retrieval',
  'grep-search',
  'str-replace-editor',
  'save-file',
  'remove-files',
  'launch-process',
  'read-process',
  'write-process',
  'list-processes',
  'kill-process',
] as const;

export class AuggieCliExecutor implements Executor {
  private runningProcess: ChildProcess | null = null;
  private interrupted = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly config: AuggieCliExecutorConfig = {}) {}

  async run(invocation: ExecutorInvocation): Promise<ExecutorResult> {
    if (invocation.mode === 'agentic' && !invocation.workingDirectory) {
      return {
        ok: false,
        reason: 'Agentic Auggie runs require a workingDirectory',
      };
    }

    const args = this.buildArgs(invocation);
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

      const child = execFile('auggie', args, {
        timeout: 0,
        cwd: invocation.workingDirectory,
      });

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
          finalize({
            ok: false,
            reason:
              'auggie CLI not found on PATH. Install with: npm install -g @augmentcode/auggie',
          });
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
          finalize({ ok: false, reason: stderr || `auggie process exited with signal ${signal}` });
          return;
        }

        if (code !== 0) {
          finalize({
            ok: false,
            reason: stderr || `auggie exited with code ${code ?? 'unknown'}`,
          });
          return;
        }

        // Success — write output to disk
        // outputPath is constructed by the application layer — trusted input
        try {
          await fs.mkdir(path.dirname(invocation.outputPath), { recursive: true });
          await fs.writeFile(invocation.outputPath, stdout, 'utf8');
          // TODO(M5a-007): Parse usage from Auggie CLI output when available
          finalize({ ok: true, artifactPath: invocation.outputPath, content: stdout });
        } catch (writeErr) {
          finalize({
            ok: false,
            reason: `Failed to write artifact: ${(writeErr as Error).message}`,
          });
        }
      });

      this.runningProcess = child;

      // Pipe prompt via stdin only for artifact mode.
      if (child.stdin) {
        if (this.shouldPipePromptViaStdin(invocation)) {
          child.stdin.write(invocation.prompt);
        }
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
  private buildArgs(invocation: ExecutorInvocation): string[] {
    const args = ['--print'];

    if (invocation.mode === 'agentic') {
      args.push(
        '--quiet',
        '--workspace-root',
        invocation.workingDirectory as string,
        '--allow-indexing',
        '--max-turns',
        String(this.config.maxTurns ?? DEFAULT_AGENTIC_MAX_TURNS),
      );

      for (const tool of AUGGIE_AGENTIC_ALLOWED_TOOLS) {
        args.push('--permission', `${tool}:allow`);
      }
    }

    if (this.config.model) {
      args.push('--model', this.config.model);
    }

    if (invocation.mode === 'agentic') {
      args.push(invocation.prompt);
    }

    return args;
  }

  private shouldPipePromptViaStdin(invocation: ExecutorInvocation): boolean {
    return invocation.mode !== 'agentic';
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
      '[AuggieCliExecutor timeout diagnostics]',
      `ticketId: ${invocation.ticketId}`,
      `column: ${invocation.column}`,
      `timeoutMs: ${timeoutMs}`,
      `command: auggie`,
      `args: ${JSON.stringify(this.redactArgsForDiagnostics(args, invocation))}`,
      'promptPreview:',
      promptPreview,
      this.formatCapturedOutput('stdoutPreview', stdout),
      this.formatCapturedOutput('stderrPreview', stderr),
    ].join('\n');

    process.stderr.write(`${message}\n`);
  }

  private redactArgsForDiagnostics(args: string[], invocation: ExecutorInvocation): string[] {
    if (invocation.mode !== 'agentic') {
      return args;
    }

    return args.map((arg, index) => {
      if (index === args.length - 1) {
        return `<prompt:${invocation.prompt.length} chars>`;
      }

      return arg;
    });
  }
}
