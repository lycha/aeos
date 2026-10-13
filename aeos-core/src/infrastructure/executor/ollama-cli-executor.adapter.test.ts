import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

import { Column } from '../../domain/model/column.js';
import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';
import { OllamaCliExecutor } from './ollama-cli-executor.adapter.js';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
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
  Object.defineProperty(child, 'pid', { value: 2468 });
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

describe('OllamaCliExecutor', () => {
  let executor: OllamaCliExecutor;
  let tmpDir: string;

  beforeEach(async () => {
    executor = new OllamaCliExecutor({ model: 'llama3.2' });
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ollama-cli-exec-'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeInvocation(overrides: Partial<ExecutorInvocation> = {}): ExecutorInvocation {
    return {
      prompt: 'Test prompt',
      outputPath: path.join(tmpDir, 'output.md'),
      ticketId: 'T-55',
      column: Column.PRODUCT_SCOPING,
      ...overrides,
    };
  }

  it('writes stdout to outputPath and streams chunks to the observer', async () => {
    const onChunk = vi.fn();

    mockExecFile.mockImplementation(() => {
      const child = createMockChild();
      process.nextTick(() => {
        child.stdout.write('hello ');
        child.stderr.write('note');
        child.stdout.write('ollama');
        emitClose(child, 0);
      });
      return child;
    });

    const invocation = makeInvocation({ onChunk });
    const result = await executor.run(invocation);

    expect(result.ok).toBe(true);
    expect(await fs.readFile(invocation.outputPath, 'utf8')).toBe('hello ollama');
    expect(onChunk.mock.calls).toEqual([
      ['stdout', 'hello '],
      ['stderr', 'note'],
      ['stdout', 'ollama'],
    ]);
  });

  it('returns a helpful error when the ollama binary is missing', async () => {
    mockExecFile.mockImplementation(() => {
      const child = createMockChild();
      process.nextTick(() => {
        const err = new Error('spawn ollama ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        child.emit('error', err);
      });
      return child;
    });

    await expect(executor.run(makeInvocation())).resolves.toEqual({
      ok: false,
      reason: 'ollama CLI not found on PATH. Install from https://ollama.com',
    });
  });
});
