// Adapter — OpenCode CLI (child_process) implementation of Executor port

import { type ChildProcess, execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';
import type { ExecutorResult } from '../../domain/model/executor-result.js';
import type { Executor } from '../../domain/ports/driven/executor.port.js';

export interface OpenCodeCliExecutorConfig {
  model?: string;
  timeoutMs?: number;
  maxSteps?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_AGENTIC_MAX_STEPS = 12;
const TIMEOUT_OUTPUT_PREVIEW_LIMIT = 2_000;
const PROMPT_PREVIEW_LIMIT = 1_000;

const OPENCODE_AGENTIC_PERMISSION = {
  '*': 'deny',
  read: 'allow',
  edit: 'allow',
  glob: 'allow',
  grep: 'allow',
  bash: 'allow',
  task: 'deny',
  skill: 'deny',
  question: 'deny',
  webfetch: 'deny',
  websearch: 'deny',
  codesearch: 'deny',
} as const;

export class OpenCodeCliExecutor implements Executor {
  private runningProcess: ChildProcess | null = null;
  private interrupted = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly config: OpenCodeCliExecutorConfig = {}) {}

  async run(invocation: ExecutorInvocation): Promise<ExecutorResult> {
    if (invocation.mode === 'agentic' && !invocation.workingDirectory) {
      return { ok: false, reason: 'Agentic OpenCode runs require a workingDirectory' };
    }

    const args = this.buildArgs(invocation);
    const env = this.buildEnv(invocation);
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
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.runningProcess = null;
        resolve(result);
      };

      const child = execFile('opencode', args, {
        timeout: 0,
        cwd: invocation.workingDirectory,
        env,
      });

      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk;
        invocation.onChunk?.('stdout', chunk);
      });
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
        invocation.onChunk?.('stderr', chunk);
      });

      child.once('error', (error) => {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
          finalize({
            ok: false,
            reason: 'opencode CLI not found on PATH. Install from https://opencode.ai',
          });
          return;
        }
        finalize({ ok: false, reason: stderr || err.message });
      });

      child.once('close', async (code, signal) => {
        if (settled) return;
        if (timedOut) {
          finalize({ ok: false, reason: this.buildTimeoutReason(timeoutMs, stdout, stderr) });
          return;
        }
        if (this.interrupted) {
          finalize({ ok: false, reason: 'Execution interrupted by operator' });
          return;
        }
        if (signal) {
          finalize({
            ok: false,
            reason: stderr || `opencode process exited with signal ${signal}`,
          });
          return;
        }
        if (code !== 0) {
          finalize({
            ok: false,
            reason: stderr || `opencode exited with code ${code ?? 'unknown'}`,
          });
          return;
        }

        try {
          await fs.mkdir(path.dirname(invocation.outputPath), { recursive: true });
          await fs.writeFile(invocation.outputPath, stdout, 'utf8');
          finalize({ ok: true, artifactPath: invocation.outputPath, content: stdout });
        } catch (writeErr) {
          finalize({
            ok: false,
            reason: `Failed to write artifact: ${(writeErr as Error).message}`,
          });
        }
      });

      this.runningProcess = child;
      this.timer = setTimeout(() => {
        timedOut = true;
        this.logTimeoutDiagnostics(invocation, args, timeoutMs, stdout, stderr);
        child.kill('SIGKILL');
      }, timeoutMs);
    });
  }

  async interrupt(): Promise<void> {
    if (!this.runningProcess) return;
    this.interrupted = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.runningProcess.kill('SIGTERM');
    this.runningProcess = null;
  }

  private buildArgs(invocation: ExecutorInvocation): string[] {
    const args = ['run'];
    if (this.config.model) args.push('--model', this.config.model);
    if (invocation.mode === 'agentic') args.push('--dangerously-skip-permissions');
    args.push(invocation.prompt);
    return args;
  }

  private buildEnv(invocation: ExecutorInvocation): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (invocation.mode === 'agentic') {
      env.OPENCODE_PERMISSION = JSON.stringify(OPENCODE_AGENTIC_PERMISSION);
      env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
        share: 'disabled',
        agent: { build: { steps: this.config.maxSteps ?? DEFAULT_AGENTIC_MAX_STEPS } },
      });
    }
    return env;
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
    if (text.length === 0) return `${label}: (no output captured)`;
    if (text.length <= TIMEOUT_OUTPUT_PREVIEW_LIMIT) return `${label}:\n${text}`;
    return `${label} (showing last ${TIMEOUT_OUTPUT_PREVIEW_LIMIT} chars of ${text.length}):\n${text.slice(-TIMEOUT_OUTPUT_PREVIEW_LIMIT)}`;
  }

  private logTimeoutDiagnostics(
    invocation: ExecutorInvocation,
    args: string[],
    timeoutMs: number,
    stdout: string,
    stderr: string,
  ): void {
    const message = [
      '[OpenCodeCliExecutor timeout diagnostics]',
      `ticketId: ${invocation.ticketId}`,
      `column: ${invocation.column}`,
      `timeoutMs: ${timeoutMs}`,
      'command: opencode',
      `args: ${JSON.stringify(this.redactArgsForDiagnostics(args, invocation))}`,
      'promptPreview:',
      invocation.prompt.slice(0, PROMPT_PREVIEW_LIMIT),
      this.formatCapturedOutput('stdoutPreview', stdout),
      this.formatCapturedOutput('stderrPreview', stderr),
    ].join('\n');
    process.stderr.write(`${message}\n`);
  }

  private redactArgsForDiagnostics(args: string[], invocation: ExecutorInvocation): string[] {
    return args.map((arg, index) =>
      index === args.length - 1 ? `<prompt:${invocation.prompt.length} chars>` : arg,
    );
  }
}
