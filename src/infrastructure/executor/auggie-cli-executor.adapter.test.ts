import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

import { Column } from '../../domain/model/column.js';
import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';
import { AuggieCliExecutor } from './auggie-cli-executor.adapter.js';

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
  Object.defineProperty(child, 'pid', { value: 4321 });
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

describe('AuggieCliExecutor', () => {
  let executor: AuggieCliExecutor;
  let tmpDir: string;

  beforeEach(async () => {
    executor = new AuggieCliExecutor();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auggie-cli-exec-'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeInvocation(overrides: Partial<ExecutorInvocation> = {}): ExecutorInvocation {
    return {
      prompt: 'Test prompt',
      outputPath: path.join(tmpDir, 'output.md'),
      ticketId: 'T-99',
      column: Column.IMPLEMENTATION,
      ...overrides,
    };
  }

  it('invokes auggie CLI with --print in artifact mode', async () => {
    setupExecFile((child) => {
      child.stdout.write('output');
      emitClose(child, 0);
    });

    await executor.run(makeInvocation());

    expect(mockExecFile).toHaveBeenCalledWith('auggie', ['--print'], expect.any(Object));
  });

  it('uses agentic args, cwd, and permissions when mode is agentic', async () => {
    setupExecFile((child) => {
      child.stdout.write('Changed files and added tests.');
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
      'auggie',
      [
        '--print',
        '--quiet',
        '--workspace-root',
        tmpDir,
        '--allow-indexing',
        '--max-turns',
        '12',
        '--permission',
        'view:allow',
        '--permission',
        'codebase-retrieval:allow',
        '--permission',
        'grep-search:allow',
        '--permission',
        'str-replace-editor:allow',
        '--permission',
        'save-file:allow',
        '--permission',
        'remove-files:allow',
        '--permission',
        'launch-process:allow',
        '--permission',
        'read-process:allow',
        '--permission',
        'write-process:allow',
        '--permission',
        'list-processes:allow',
        '--permission',
        'kill-process:allow',
        'Implement the feature and summarize what changed.',
      ],
      expect.objectContaining({ cwd: tmpDir, timeout: 0 }),
    );
  });

  it('passes --model flag when config.model is set', async () => {
    executor = new AuggieCliExecutor({ model: 'auggie-pro' });
    setupExecFile((child) => {
      child.stdout.write('output');
      emitClose(child, 0);
    });

    await executor.run(makeInvocation());

    expect(mockExecFile).toHaveBeenCalledWith(
      'auggie',
      ['--print', '--model', 'auggie-pro'],
      expect.any(Object),
    );
  });

  it('pipes prompt to stdin in artifact mode', async () => {
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

    await executor.run(makeInvocation({ prompt: 'Hello Auggie!' }));

    expect(writtenData).toBe('Hello Auggie!');
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
      makeInvocation({
        mode: 'agentic',
        workingDirectory: tmpDir,
        prompt: 'Edit files and summarize changes.',
      }),
    );

    expect(writtenData).toBe('');
  });

  it('returns an error when agentic mode is missing workingDirectory', async () => {
    const result = await executor.run(makeInvocation({ mode: 'agentic' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Agentic Auggie runs require a workingDirectory');
    }
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('writes stdout to outputPath on success', async () => {
    setupExecFile((child) => {
      child.stdout.write('# Agentic Summary');
      emitClose(child, 0);
    });

    const invocation = makeInvocation({ mode: 'agentic', workingDirectory: tmpDir });
    const result = await executor.run(invocation);

    expect(result.ok).toBe(true);
    const content = await fs.readFile(invocation.outputPath, 'utf8');
    expect(content).toBe('# Agentic Summary');
  });

  it('kills process and returns timeout diagnostics when timeout exceeded', async () => {
    executor = new AuggieCliExecutor({ timeoutMs: 50 });
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

      const result = await executor.run(
        makeInvocation({
          mode: 'agentic',
          workingDirectory: tmpDir,
          prompt: 'P'.repeat(1_500),
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Executor timeout after 1s');
        expect(result.reason).toContain('partial stdout');
        expect(result.reason).toContain('partial stderr');
      }
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AuggieCliExecutor timeout diagnostics]'),
      );
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('timeoutMs: 50'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('"--workspace-root","' + tmpDir + '"'),
      );
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining(`<prompt:${'P'.repeat(1_500).length} chars>`),
      );
    } finally {
      stderrWriteSpy.mockRestore();
    }
  });
});
