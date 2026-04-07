// Adapter — Stub executor (no-op / test double for Executor port)

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';
import type { ExecutorResult } from '../../domain/model/executor-result.js';
import type { Executor } from '../../domain/ports/driven/executor.port.js';

export class StubExecutor implements Executor {
  async run(invocation: ExecutorInvocation): Promise<ExecutorResult> {
    const content = [
      '# STUB OUTPUT',
      `**Ticket:** ${invocation.ticketId}`,
      `**Column:** ${invocation.column}`,
      `**Generated:** ${new Date().toISOString()}`,
      '',
      'This is a stub artifact produced by StubExecutor for pipeline testing.',
      'All structural checks should pass on this output.',
      '',
    ].join('\n');

    await fs.mkdir(path.dirname(invocation.outputPath), { recursive: true });
    await fs.writeFile(invocation.outputPath, content, 'utf8');

    return {
      ok: true,
      artifactPath: invocation.outputPath,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
  }

  async interrupt(): Promise<void> {
    // StubExecutor completes synchronously; nothing to interrupt.
  }
}
