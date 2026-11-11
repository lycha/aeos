import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';
import { ClaudeCodeCliExecutor } from './claude-cli-executor.adapter.js';

// Mock child_process module
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';

const mockExecFile = vi.mocked(execFile);

type MockChildProcess = ChildProcess & {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: Writable;
};

function createMockChild(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  child.kill = vi.fn().mockReturnValue(true);
  Object.defineProperty(child, 'pid', { value: 12345 });
  return child;
}

function emitClose(
  child: MockChildProcess,
  code: number | null,
  signal: NodeJS.Signals | null = null,
) {
  child.stdout.end();
  child.stderr.end();
  process.nextTick(() => child.emit('close', code, signal));
}

const STREAM_ARGS = ['--output-format', 'stream-json', '--verbose'];

const assistantLine = (text: string): string =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } }) + '\n';

const resultLine = (fields: Record<string, unknown>): string =>
  JSON.stringify({ type: 'result', ...fields }) + '\n';

function setupExecFile(handler: (child: MockChildProcess) => void) {
  mockExecFile.mockImplementation(() => {
    const child = createMockChild();
    // Defer so the caller can capture the child reference
    process.nextTick(() => handler(child));
    return child;
  });
}

describe('ClaudeCodeCliExecutor', () => {
  let executor: ClaudeCodeCliExecutor;
  let tmpDir: string;

  beforeEach(async () => {
    executor = new ClaudeCodeCliExecutor();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-cli-exec-'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeInvocation(overrides: Partial<ExecutorInvocation> = {}): ExecutorInvocation {
    return {
      prompt: 'Test prompt',
      outputPath: path.join(tmpDir, 'output.md'),
      ticketId: 'T-42',
      column: 'IMPLEMENTATION',
      ...overrides,
    };
  }

  it('invokes claude CLI with --print and - flags', async () => {
    setupExecFile((child) => {
      child.stdout.write('output');
      emitClose(child, 0);
    });
    const invocation = makeInvocation();
    await executor.run(invocation);

    expect(mockExecFile).toHaveBeenCalledWith(
      'claude',
      ['--print', '-', ...STREAM_ARGS],
      expect.any(Object),
    );
  });

  it('uses agentic CLI args and working directory when mode is agentic', async () => {
    setupExecFile((child) => {
      child.stdout.write('Implemented feature and updated tests.');
      emitClose(child, 0);
    });

    await executor.run(
      makeInvocation({
        mode: 'agentic',
        workingDirectory: tmpDir,
        prompt: 'Implement the feature and summarize what changed.',
      }),
    );

    expect(mockExecFile).toHaveBeenCalledWith(
      'claude',
      [
        '-p',
        'Implement the feature and summarize what changed.',
        '--permission-mode',
        'acceptEdits',
        '--allowedTools',
        'Bash,Glob,Grep,LS,Read,Edit,MultiEdit,Write',
        ...STREAM_ARGS,
      ],
      expect.objectContaining({ cwd: tmpDir, timeout: 0 }),
    );
  });

  it('passes --model flag when config.model is set', async () => {
    executor = new ClaudeCodeCliExecutor({ model: 'claude-opus-4-6' });
    setupExecFile((child) => {
      child.stdout.write('output');
      emitClose(child, 0);
    });
    await executor.run(makeInvocation());

    expect(mockExecFile).toHaveBeenCalledWith(
      'claude',
      ['--print', '-', ...STREAM_ARGS, '--model', 'claude-opus-4-6'],
      expect.any(Object),
    );
  });

  it('pipes prompt to child stdin', async () => {
    let writtenData = '';
    mockExecFile.mockImplementation(() => {
      const child = createMockChild();
      child.stdin = new Writable({
        write(chunk, _enc, callback) {
          writtenData += chunk.toString();
          callback();
        },
      });
      process.nextTick(() => {
        child.stdout.write('result');
        emitClose(child, 0);
      });
      return child;
    });

    await executor.run(makeInvocation({ prompt: 'Hello Claude!' }));
    expect(writtenData).toBe('Hello Claude!');
  });

  it('does not pipe prompt to stdin in agentic mode', async () => {
    let writtenData = '';
    mockExecFile.mockImplementation(() => {
      const child = createMockChild();
      child.stdin = new Writable({
        write(chunk, _enc, callback) {
          writtenData += chunk.toString();
          callback();
        },
      });
      process.nextTick(() => {
        child.stdout.write('summary');
        emitClose(child, 0);
      });
      return child;
    });

    await executor.run(
      makeInvocation({ mode: 'agentic', prompt: 'Edit files and summarize changes.' }),
    );
    expect(writtenData).toBe('');
  });

  it('captures stdout incrementally across multiple chunks', async () => {
    setupExecFile((child) => {
      child.stdout.write('# Generated ');
      child.stdout.write('Output');
      emitClose(child, 0);
    });

    const invocation = makeInvocation();
    const result = await executor.run(invocation);

    expect(result.ok).toBe(true);
    const content = await fs.readFile(invocation.outputPath, 'utf8');
    expect(content).toBe('# Generated Output');
  });

  it('forwards assistant text to the observer in order and passes non-JSON lines through', async () => {
    const onChunk = vi.fn();

    setupExecFile((child) => {
      child.stdout.write(JSON.stringify({ type: 'system', subtype: 'init' }) + '\n');
      // An event split across two chunks must still be parsed as one line.
      const first = assistantLine('hello');
      child.stdout.write(first.slice(0, 10));
      child.stdout.write(first.slice(10));
      child.stderr.write('warn');
      child.stdout.write('not json\n');
      child.stdout.write(assistantLine('world'));
      child.stdout.write(resultLine({ result: 'hello world' }));
      emitClose(child, 0);
    });

    await executor.run(makeInvocation({ onChunk }));

    expect(onChunk.mock.calls).toEqual([
      ['stdout', 'hello\n'],
      ['stderr', 'warn'],
      ['stdout', 'not json\n'],
      ['stdout', 'world\n'],
    ]);
  });

  it('takes artefact, tokens and cost from the final result message', async () => {
    const stream =
      assistantLine('thinking aloud') +
      resultLine({
        result: '# Final artefact',
        usage: {
          input_tokens: 120,
          output_tokens: 45,
          cache_creation_input_tokens: 9,
          cache_read_input_tokens: 7,
        },
        total_cost_usd: 0.0123,
      });
    setupExecFile((child) => {
      child.stdout.write(stream);
      emitClose(child, 0);
    });

    const invocation = makeInvocation();
    const result = await executor.run(invocation);

    expect(result).toEqual({
      ok: true,
      artifactPath: invocation.outputPath,
      content: '# Final artefact',
      usage: { inputTokens: 120, outputTokens: 45, costUsd: 0.0123 },
      transcript: stream,
    });
    expect(await fs.readFile(invocation.outputPath, 'utf8')).toBe('# Final artefact');
  });

  it('writes the streamed text and leaves usage undefined when no result message arrives', async () => {
    const stream = assistantLine('partial answer');
    setupExecFile((child) => {
      child.stdout.write(stream);
      emitClose(child, 0);
    });

    const invocation = makeInvocation();
    const result = await executor.run(invocation);

    expect(result).toEqual({
      ok: true,
      artifactPath: invocation.outputPath,
      content: 'partial answer\n',
      usage: undefined,
      transcript: stream,
    });
    expect(await fs.readFile(invocation.outputPath, 'utf8')).toBe('partial answer\n');
  });

  it('leaves usage undefined when the result message carries no cost', async () => {
    setupExecFile((child) => {
      child.stdout.write(
        resultLine({ result: 'text', usage: { input_tokens: 1, output_tokens: 2 } }),
      );
      emitClose(child, 0);
    });

    const result = await executor.run(makeInvocation());

    expect(result).toMatchObject({ ok: true, content: 'text', usage: undefined });
  });

  it('returns the error result text as the reason on non-zero exit', async () => {
    setupExecFile((child) => {
      child.stdout.write(
        resultLine({ is_error: true, result: 'Credit balance is too low', total_cost_usd: 0 }),
      );
      emitClose(child, 1);
    });

    const result = await executor.run(makeInvocation());

    expect(result).toEqual({ ok: false, reason: 'Credit balance is too low' });
  });

  it('writes stdout to outputPath on success', async () => {
    setupExecFile((child) => {
      child.stdout.write('# Generated Output');
      emitClose(child, 0);
    });
    const invocation = makeInvocation();
    const result = await executor.run(invocation);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifactPath).toBe(invocation.outputPath);
    }
    const content = await fs.readFile(invocation.outputPath, 'utf8');
    expect(content).toBe('# Generated Output');
  });

  it('creates output directory if missing', async () => {
    setupExecFile((child) => {
      child.stdout.write('content');
      emitClose(child, 0);
    });
    const deepPath = path.join(tmpDir, 'nested', 'deep', 'output.md');
    const invocation = makeInvocation({ outputPath: deepPath });
    await executor.run(invocation);

    const content = await fs.readFile(deepPath, 'utf8');
    expect(content).toBe('content');
  });

  it('returns ok: false with stderr on non-zero exit', async () => {
    setupExecFile((child) => {
      child.stderr.write('Error: rate limited');
      emitClose(child, 1);
    });

    const result = await executor.run(makeInvocation());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Error: rate limited');
    }
  });

  it('returns ok: false with error message when stderr is empty', async () => {
    setupExecFile((child) => {
      emitClose(child, 1);
    });

    const result = await executor.run(makeInvocation());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('claude exited with code 1');
    }
  });

  it('returns ok: false with ENOENT message when claude binary not found', async () => {
    setupExecFile((child) => {
      const err = new Error('spawn claude ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      child.emit('error', err);
    });

    const result = await executor.run(makeInvocation());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('claude CLI not found on PATH');
    }
  });

  it('kills process and returns timeout diagnostics when timeout exceeded', async () => {
    executor = new ClaudeCodeCliExecutor({ timeoutMs: 50 });
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      mockExecFile.mockImplementation(() => {
        const child = createMockChild();
        process.nextTick(() => {
          child.stdout.write('partial stdout');
          child.stderr.write('partial stderr');
        });
        (child.kill as ReturnType<typeof vi.fn>).mockImplementation(() => {
          emitClose(child, null, 'SIGKILL');
          return true;
        });
        return child;
      });

      const result = await executor.run(makeInvocation({ prompt: 'P'.repeat(1_500) }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Executor timeout after 1s');
        expect(result.reason).toContain('Partial stdout');
        expect(result.reason).toContain('partial stdout');
        expect(result.reason).toContain('Partial stderr');
        expect(result.reason).toContain('partial stderr');
      }
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ClaudeCodeCliExecutor timeout diagnostics]'),
      );
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('timeoutMs: 50'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'args: ["--print","-","--output-format","stream-json","--verbose"]',
        ),
      );
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('promptPreview:'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('P'.repeat(1_000)));
    } finally {
      stderrWriteSpy.mockRestore();
    }
  });

  it('interrupt() kills running process and run() returns interrupted error', async () => {
    let childRef: MockChildProcess | null = null;

    mockExecFile.mockImplementation(() => {
      const child = createMockChild();
      childRef = child;
      // Don't close — simulate a long-running process that has already streamed
      process.nextTick(() => child.stdout.write(assistantLine('working')));
      (child.kill as ReturnType<typeof vi.fn>).mockImplementation(() => {
        emitClose(child, null, 'SIGTERM');
        return true;
      });
      return child;
    });

    const runPromise = executor.run(makeInvocation());

    // Wait for the mock to set up
    await new Promise((r) => setTimeout(r, 10));

    expect(childRef).not.toBeNull();
    await executor.interrupt();

    const result = await runPromise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Execution interrupted by operator');
    }
  });

  it('interrupt() is a no-op when no process is running', async () => {
    await expect(executor.interrupt()).resolves.toBeUndefined();
  });
});
