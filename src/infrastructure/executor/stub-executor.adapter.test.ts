import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { Column } from '../../domain/model/column.js';
import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';
import { StubExecutor } from './stub-executor.adapter.js';

describe('StubExecutor', () => {
  let executor: StubExecutor;
  let tmpDir: string;

  beforeEach(async () => {
    executor = new StubExecutor();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stub-executor-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeInvocation(overrides: Partial<ExecutorInvocation> = {}): ExecutorInvocation {
    return {
      prompt: 'Test prompt',
      outputPath: path.join(tmpDir, 'output.md'),
      ticketId: 'T-42',
      column: Column.PRODUCT_SCOPING,
      ...overrides,
    };
  }

  it('writes output file at the specified outputPath', async () => {
    const invocation = makeInvocation();
    await executor.run(invocation);

    const stat = await fs.stat(invocation.outputPath);
    expect(stat.isFile()).toBe(true);
  });

  it('written file contains ticket ID and column', async () => {
    const invocation = makeInvocation({
      ticketId: 'PROJ-99',
      column: Column.ARCH_SPIKE,
    });
    await executor.run(invocation);

    const content = await fs.readFile(invocation.outputPath, 'utf8');
    expect(content).toContain('**Ticket:** PROJ-99');
    expect(content).toContain('**Column:** ARCH_SPIKE');
  });

  it('written file contains stub header and description', async () => {
    const invocation = makeInvocation();
    await executor.run(invocation);

    const content = await fs.readFile(invocation.outputPath, 'utf8');
    expect(content).toContain('# STUB OUTPUT');
    expect(content).toContain('StubExecutor for pipeline testing');
  });

  it('agentic mode writes a stub execution summary', async () => {
    const invocation = makeInvocation({ mode: 'agentic' });
    await executor.run(invocation);

    const content = await fs.readFile(invocation.outputPath, 'utf8');
    expect(content).toContain('**Mode:** agentic');
    expect(content).toContain('stub agentic execution summary');
  });

  it('written file contains an ISO timestamp', async () => {
    const invocation = makeInvocation();
    await executor.run(invocation);

    const content = await fs.readFile(invocation.outputPath, 'utf8');
    // ISO 8601 pattern: YYYY-MM-DDTHH:mm:ss.sssZ
    expect(content).toMatch(/\*\*Generated:\*\* \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('returns ok: true with artifactPath matching outputPath', async () => {
    const invocation = makeInvocation();
    const result = await executor.run(invocation);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifactPath).toBe(invocation.outputPath);
    }
  });

  it('returns usage with all token counts at 0', async () => {
    const invocation = makeInvocation();
    const result = await executor.run(invocation);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      });
    }
  });

  it('creates parent directories when they do not exist', async () => {
    const deepPath = path.join(tmpDir, 'nested', 'deep', 'dir', 'output.md');
    const invocation = makeInvocation({ outputPath: deepPath });

    await executor.run(invocation);

    const content = await fs.readFile(deepPath, 'utf8');
    expect(content).toContain('# STUB OUTPUT');
  });

  it('interrupt() resolves without error', async () => {
    await expect(executor.interrupt()).resolves.toBeUndefined();
  });
});
