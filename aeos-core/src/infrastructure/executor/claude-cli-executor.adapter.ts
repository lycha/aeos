// Adapter — Claude CLI (child_process) implementation of Executor port

import { type ChildProcess, execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';
import type { ExecutorResult, TokenUsage } from '../../domain/model/executor-result.js';
import type { Executor } from '../../domain/ports/driven/executor.port.js';

/** Configuration for the Claude CLI executor. */
export interface ClaudeCliExecutorConfig {
  /** Model identifier passed as --model flag (e.g. 'claude-opus-4-6'). */
  model?: string;
  /** Timeout in milliseconds before killing the process (default: 300 000). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;
const TIMEOUT_OUTPUT_PREVIEW_LIMIT = 2_000;
const PROMPT_PREVIEW_LIMIT = 1_000;
const AGENTIC_ALLOWED_TOOLS = 'Bash,Glob,Grep,LS,Read,Edit,MultiEdit,Write';

/** The fields AEOS reads from one line of `--output-format stream-json`. */
interface StreamEvent {
  type?: unknown;
  message?: { content?: unknown };
  result?: unknown;
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
  total_cost_usd?: unknown;
}

function parseEvent(line: string): StreamEvent | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null ? (value as StreamEvent) : undefined;
  } catch {
    return undefined;
  }
}

function assistantText(event: StreamEvent): string {
  const content = event.message?.content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block: { type?: unknown; text?: unknown }) =>
      block?.type === 'text' && typeof block.text === 'string' ? block.text : '',
    )
    .join('');
}

function parseUsage(result: StreamEvent): TokenUsage | undefined {
  const { usage, total_cost_usd: costUsd } = result;
  const inputTokens = usage?.input_tokens;
  const outputTokens = usage?.output_tokens;
  if (
    typeof inputTokens !== 'number' ||
    typeof outputTokens !== 'number' ||
    typeof costUsd !== 'number'
  ) {
    return undefined;
  }
  return { inputTokens, outputTokens, costUsd };
}

export class ClaudeCodeCliExecutor implements Executor {
  private runningProcess: ChildProcess | null = null;
  private interrupted = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly config: ClaudeCliExecutorConfig = {}) {}

  async run(invocation: ExecutorInvocation): Promise<ExecutorResult> {
    const args = this.buildArgs(invocation);
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.interrupted = false;

    return new Promise<ExecutorResult>((resolve) => {
      let timedOut = false;
      let stdout = '';
      let stderr = '';
      let settled = false;
      let pending = '';
      let text = '';
      let resultEvent: StreamEvent | undefined;

      const forward = (chunk: string): void => {
        text += chunk;
        invocation.onChunk?.('stdout', chunk);
      };
      const handleLine = (line: string, terminator: string): void => {
        const event = parseEvent(line);
        if (!event) {
          forward(line + terminator);
        } else if (event.type === 'result') {
          resultEvent = event;
        } else if (event.type === 'assistant') {
          const said = assistantText(event);
          // Separate turns so the live display does not run them together.
          if (said) forward(said.endsWith('\n') ? said : `${said}\n`);
        }
      };

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

      const child = execFile('claude', args, {
        timeout: 0,
        cwd: invocation.workingDirectory,
      });

      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk;
        const lines = (pending + chunk).split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) handleLine(line, '\n');
      });
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
        invocation.onChunk?.('stderr', chunk);
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
        if (pending) handleLine(pending, '');
        const resultText = typeof resultEvent?.result === 'string' ? resultEvent.result : undefined;

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
            reason: resultText || stderr || `claude exited with code ${code ?? 'unknown'}`,
          });
          return;
        }

        // Success — write output to disk
        // outputPath is constructed by the application layer — trusted input
        try {
          await fs.mkdir(path.dirname(invocation.outputPath), { recursive: true });
          // No usable result line: keep the streamed text, and leave usage unknown.
          const content = resultText ?? text;
          await fs.writeFile(invocation.outputPath, content, 'utf8');
          finalize({
            ok: true,
            artifactPath: invocation.outputPath,
            content,
            usage: resultEvent && resultText !== undefined ? parseUsage(resultEvent) : undefined,
            transcript: stdout,
          });
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
    const args =
      invocation.mode === 'agentic'
        ? [
            '-p',
            invocation.prompt,
            '--permission-mode',
            'acceptEdits',
            '--allowedTools',
            AGENTIC_ALLOWED_TOOLS,
          ]
        : ['--print', '-'];

    // Streaming keeps the live display working and ends in a result line with usage and cost.
    args.push('--output-format', 'stream-json', '--verbose');
    if (this.config.model) {
      args.push('--model', this.config.model);
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
      '[ClaudeCodeCliExecutor timeout diagnostics]',
      `ticketId: ${invocation.ticketId}`,
      `column: ${invocation.column}`,
      `timeoutMs: ${timeoutMs}`,
      `command: claude`,
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
      if (index === 1 && args[0] === '-p') {
        return `<prompt:${invocation.prompt.length} chars>`;
      }
      return arg;
    });
  }
}
