import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

import { Column } from '../../domain/model/column.js';
import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';
import { ClaudeCodeCliExecutor } from './claude-cli-executor.adapter.js';

// Mock child_process module
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';

const mockExecFile = vi.mocked(execFile);

type ExecFileCallback = (err: Error | null, stdout: string, stderr: string) => void;

function createMockChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  child.stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  child.kill = vi.fn().mockReturnValue(true);
  Object.defineProperty(child, 'pid', { value: 12345 });
  return child;
}

function setupExecFile(
  handler: (
    child: ChildProcess,
    callback: (err: Error | null, stdout: string, stderr: string) => void,
  ) => void,
) {
  mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
    const child = createMockChild();
    const callback = cb as (err: Error | null, stdout: string, stderr: string) => void;
    // Defer so the caller can capture the child reference
    process.nextTick(() => handler(child, callback));
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
      column: Column.IMPLEMENTATION,
      ...overrides,
    };
  }

  it('invokes claude CLI with --print and - flags', async () => {
    setupExecFile((_child, cb) => cb(null, 'output', ''));
    const invocation = makeInvocation();
    await executor.run(invocation);

    expect(mockExecFile).toHaveBeenCalledWith(
      'claude',
      ['--print', '-'],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('passes --model flag when config.model is set', async () => {
    executor = new ClaudeCodeCliExecutor({ model: 'claude-opus-4-6' });
    setupExecFile((_child, cb) => cb(null, 'output', ''));
    await executor.run(makeInvocation());

    expect(mockExecFile).toHaveBeenCalledWith(
      'claude',
      ['--print', '-', '--model', 'claude-opus-4-6'],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('passes --max-tokens flag when config.maxTokens is set', async () => {
    executor = new ClaudeCodeCliExecutor({ maxTokens: 8000 });
    setupExecFile((_child, cb) => cb(null, 'output', ''));
    await executor.run(makeInvocation());

    expect(mockExecFile).toHaveBeenCalledWith(
      'claude',
      ['--print', '-', '--max-tokens', '8000'],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('pipes prompt to child stdin', async () => {
    let writtenData = '';
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const child = createMockChild();
        child.stdin = new Writable({
          write(chunk, _enc, callback) {
            writtenData += chunk.toString();
            callback();
          },
        });
        process.nextTick(() => (cb as ExecFileCallback)(null, 'result', ''));
        return child;
      },
    );

    await executor.run(makeInvocation({ prompt: 'Hello Claude!' }));
    expect(writtenData).toBe('Hello Claude!');
  });

  it('writes stdout to outputPath on success', async () => {
    setupExecFile((_child, cb) => cb(null, '# Generated Output', ''));
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
    setupExecFile((_child, cb) => cb(null, 'content', ''));
    const deepPath = path.join(tmpDir, 'nested', 'deep', 'output.md');
    const invocation = makeInvocation({ outputPath: deepPath });
    await executor.run(invocation);

    const content = await fs.readFile(deepPath, 'utf8');
    expect(content).toBe('content');
  });

  it('returns ok: false with stderr on non-zero exit', async () => {
    setupExecFile((_child, cb) => {
      const err = new Error('Command failed');
      cb(err, '', 'Error: rate limited');
    });

    const result = await executor.run(makeInvocation());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Error: rate limited');
    }
  });

  it('returns ok: false with error message when stderr is empty', async () => {
    setupExecFile((_child, cb) => {
      const err = new Error('exit code 1');
      cb(err, '', '');
    });

    const result = await executor.run(makeInvocation());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('exit code 1');
    }
  });

  it('returns ok: false with ENOENT message when claude binary not found', async () => {
    setupExecFile((_child, cb) => {
      const err = new Error('spawn claude ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      cb(err, '', '');
    });

    const result = await executor.run(makeInvocation());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('claude CLI not found on PATH');
    }
  });

  it('kills process and returns timeout error when timeout exceeded', async () => {
    executor = new ClaudeCodeCliExecutor({ timeoutMs: 50 });

    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const child = createMockChild();
        // Simulate a long-running process — callback fires after kill
        (child.kill as ReturnType<typeof vi.fn>).mockImplementation(() => {
          process.nextTick(() => (cb as ExecFileCallback)(new Error('killed'), '', ''));
          return true;
        });
        return child;
      },
    );

    const result = await executor.run(makeInvocation());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Executor timeout');
    }
  });

  it('interrupt() kills running process and run() returns interrupted error', async () => {
    let childRef: ChildProcess | null = null;
    let cbRef: ExecFileCallback | null = null;

    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const child = createMockChild();
        childRef = child;
        cbRef = cb as ExecFileCallback;
        // Don't call cb — simulate a long-running process
        (child.kill as ReturnType<typeof vi.fn>).mockImplementation(() => {
          // Simulate SIGTERM causing the process to exit
          process.nextTick(() => cbRef!(new Error('killed'), '', ''));
          return true;
        });
        return child;
      },
    );

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
