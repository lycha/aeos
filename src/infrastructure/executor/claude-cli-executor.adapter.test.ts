import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
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
      column: Column.IMPLEMENTATION,
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

    expect(mockExecFile).toHaveBeenCalledWith('claude', ['--print', '-'], expect.any(Object));
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
      ['--print', '-', '--model', 'claude-opus-4-6'],
      expect.any(Object),
    );
  });

  it('passes --max-tokens flag when config.maxTokens is set', async () => {
    executor = new ClaudeCodeCliExecutor({ maxTokens: 8000 });
    setupExecFile((child) => {
      child.stdout.write('output');
      emitClose(child, 0);
    });
    await executor.run(makeInvocation());

    expect(mockExecFile).toHaveBeenCalledWith(
      'claude',
      ['--print', '-', '--max-tokens', '8000'],
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
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('args: ["--print","-"]'));
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
      // Don't close — simulate a long-running process
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
