import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
      column: Column.TECH_SPEC,
    });
    await executor.run(invocation);

    const content = await fs.readFile(invocation.outputPath, 'utf8');
    expect(content).toContain('**Ticket:** PROJ-99');
    expect(content).toContain('**Column:** TECH_SPEC');
  });

  it('emits a parseable verdict trailer when standing in for a reviewer', async () => {
    // Without this, every AEOS_EXECUTOR=stub run escalates as
    // UNPARSEABLE_VERDICT and the pipeline cannot be exercised offline.
    const invocation = makeInvocation({ ticketId: 'PROJ-99', column: Column.TECH_SPEC });
    const reviewInvocation = {
      ...invocation,
      outputPath: invocation.outputPath.replace(/\.md$/, '-review.md'),
    };

    const result = await executor.run(reviewInvocation);

    expect(result.ok).toBe(true);
    expect(result.ok && result.content).toContain('AEOS-VERDICT');
    expect(result.ok && result.content).toContain('verdict: APPROVED');
  });

  it('answers NO_BLOCKERS when standing in for preflight', async () => {
    // Anything else reads as blocking questions, which would strand every
    // stub run at the first column with preflight enabled.
    const invocation = makeInvocation({});
    const preflight = {
      ...invocation,
      outputPath: path.join(path.dirname(invocation.outputPath), 'preflight-PROJ-1-abc.md'),
    };

    const result = await executor.run(preflight);

    expect(result.ok && result.content).toBe('NO_BLOCKERS');
  });

  it('does not emit a verdict trailer for worker output', async () => {
    const result = await executor.run(makeInvocation({ column: Column.TECH_SPEC }));

    expect(result.ok && result.content).not.toContain('AEOS-VERDICT');
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

  it('emits generated content through onChunk when provided', async () => {
    const onChunk = vi.fn();

    await executor.run(makeInvocation({ onChunk }));

    expect(onChunk).toHaveBeenCalledWith('stdout', expect.stringContaining('# STUB OUTPUT'));
  });

  it('interrupt() resolves without error', async () => {
    await expect(executor.interrupt()).resolves.toBeUndefined();
  });
});
