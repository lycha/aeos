import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

import { Column } from '../../domain/model/column.js';
import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';
import { OpenCodeCliExecutor } from './opencode-cli-executor.adapter.js';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
import { execFile } from 'node:child_process';

const mockExecFile = vi.mocked(execFile);

type MockChildProcess = ChildProcess & {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin?: Writable;
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
  Object.defineProperty(child, 'pid', { value: 6789 });
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
    process.nextTick(() => handler(child));
    return child;
  });
}

describe('OpenCodeCliExecutor', () => {
  let executor: OpenCodeCliExecutor;
  let tmpDir: string;

  beforeEach(async () => {
    executor = new OpenCodeCliExecutor();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-cli-exec-'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeInvocation(overrides: Partial<ExecutorInvocation> = {}): ExecutorInvocation {
    return {
      prompt: 'Test prompt',
      outputPath: path.join(tmpDir, 'output.md'),
      ticketId: 'T-77',
      column: Column.IMPLEMENTATION,
      ...overrides,
    };
  }

  it('invokes opencode run in artifact mode', async () => {
    setupExecFile((child) => {
      child.stdout.write('artifact output');
      emitClose(child, 0);
    });
    await executor.run(makeInvocation());
    expect(mockExecFile).toHaveBeenCalledWith(
      'opencode',
      ['run', 'Test prompt'],
      expect.any(Object),
    );
  });

  it('uses model flag when configured', async () => {
    executor = new OpenCodeCliExecutor({ model: 'openrouter/qwen2.5-coder:32b' });
    setupExecFile((child) => {
      child.stdout.write('artifact output');
      emitClose(child, 0);
    });
    await executor.run(makeInvocation());
    expect(mockExecFile).toHaveBeenCalledWith(
      'opencode',
      ['run', '--model', 'openrouter/qwen2.5-coder:32b', 'Test prompt'],
      expect.any(Object),
    );
  });

  it('uses agentic flags and config env in agentic mode', async () => {
    executor = new OpenCodeCliExecutor({ model: 'ollama/qwen2.5-coder:14b', maxSteps: 9 });
    setupExecFile((child) => {
      child.stdout.write('Changed files and added tests.');
      emitClose(child, 0);
    });
    await executor.run(
      makeInvocation({
        mode: 'agentic',
        workingDirectory: tmpDir,
        prompt: 'Implement the feature and summarize the changes.',
      }),
    );

    expect(mockExecFile).toHaveBeenCalledWith(
      'opencode',
      [
        'run',
        '--model',
        'ollama/qwen2.5-coder:14b',
        '--dangerously-skip-permissions',
        'Implement the feature and summarize the changes.',
      ],
      expect.objectContaining({
        cwd: tmpDir,
        timeout: 0,
        env: expect.objectContaining({
          OPENCODE_PERMISSION: expect.any(String),
          OPENCODE_CONFIG_CONTENT: expect.any(String),
        }),
      }),
    );

    const execOptions = mockExecFile.mock.calls[0]?.[2] as { env: NodeJS.ProcessEnv };
    expect(JSON.parse(execOptions.env.OPENCODE_PERMISSION as string)).toMatchObject({
      read: 'allow',
      edit: 'allow',
      bash: 'allow',
      webfetch: 'deny',
      task: 'deny',
    });
    expect(JSON.parse(execOptions.env.OPENCODE_CONFIG_CONTENT as string)).toEqual({
      share: 'disabled',
      agent: { build: { steps: 9 } },
    });
  });

  it('fails early when agentic mode is missing workingDirectory', async () => {
    const result = await executor.run(makeInvocation({ mode: 'agentic' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('Agentic OpenCode runs require a workingDirectory');
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('writes stdout to outputPath on success', async () => {
    setupExecFile((child) => {
      child.stdout.write('# OpenCode Summary');
      emitClose(child, 0);
    });
    const invocation = makeInvocation({ mode: 'agentic', workingDirectory: tmpDir });
    const result = await executor.run(invocation);
    expect(result.ok).toBe(true);
    expect(await fs.readFile(invocation.outputPath, 'utf8')).toBe('# OpenCode Summary');
  });

  it('streams stdout and stderr chunks to the invocation observer', async () => {
    const onChunk = vi.fn();

    setupExecFile((child) => {
      child.stdout.write('open ');
      child.stderr.write('warning');
      child.stdout.write('code');
      emitClose(child, 0);
    });

    await executor.run(makeInvocation({ onChunk }));

    expect(onChunk.mock.calls).toEqual([
      ['stdout', 'open '],
      ['stderr', 'warning'],
      ['stdout', 'code'],
    ]);
  });

  it('returns helpful error when opencode is missing', async () => {
    mockExecFile.mockImplementation(() => {
      const child = createMockChild();
      process.nextTick(() => {
        const err = new Error('spawn opencode ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        child.emit('error', err);
      });
      return child;
    });

    const result = await executor.run(makeInvocation());
    expect(result).toEqual({
      ok: false,
      reason: 'opencode CLI not found on PATH. Install from https://opencode.ai',
    });
  });
});
