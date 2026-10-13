// Adapter — Stub executor (no-op / test double for Executor port)

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';
import type { ExecutorResult } from '../../domain/model/executor-result.js';
import type { Executor } from '../../domain/ports/driven/executor.port.js';

/**
 * Reviewer output is written to `<artifact>-review.md`, which is how the stub
 * knows to emit a verdict trailer. Without one the run escalates as
 * UNPARSEABLE_VERDICT — correct for a real reviewer, useless for a test double
 * whose whole job is exercising the pipeline end to end.
 */
function isReviewInvocation(outputPath: string): boolean {
  return outputPath.endsWith('-review.md');
}

/**
 * PreflightService writes to `<tmp>/preflight-<ticketId>-<uuid>.md` and parses
 * the output for a NO_BLOCKERS marker. Anything else is read as blocking
 * questions, which would strand every stub run at the first column.
 */
function isPreflightInvocation(outputPath: string): boolean {
  return path.basename(outputPath).startsWith('preflight-');
}

export class StubExecutor implements Executor {
  async run(invocation: ExecutorInvocation): Promise<ExecutorResult> {
    if (isPreflightInvocation(invocation.outputPath)) {
      const content = 'NO_BLOCKERS';
      invocation.onChunk?.('stdout', content);
      await fs.mkdir(path.dirname(invocation.outputPath), { recursive: true });
      await fs.writeFile(invocation.outputPath, content, 'utf8');
      return {
        ok: true,
        artifactPath: invocation.outputPath,
        content,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      };
    }

    const lines = [
      '# STUB OUTPUT',
      `**Ticket:** ${invocation.ticketId}`,
      `**Column:** ${invocation.column}`,
      `**Mode:** ${invocation.mode ?? 'artifact'}`,
      `**Generated:** ${new Date().toISOString()}`,
      '',
      invocation.mode === 'agentic'
        ? 'This is a stub agentic execution summary produced by StubExecutor for pipeline testing.'
        : 'This is a stub artifact produced by StubExecutor for pipeline testing.',
      'All structural checks should pass on this output.',
      '',
      // Padding, deliberately: column specs set minWordCount as high as 100,
      // and a stub that trips validation on the first column cannot deliver on
      // the promise that AEOS_EXECUTOR=stub exercises the pipeline offline.
      '## Notes',
      '',
      'This placeholder section exists so the artifact clears the minimum word',
      'count that column specs enforce. It carries no meaning and should never',
      'appear in a real run — if you are reading this in a committed artifact,',
      'the run was executed with the stub executor rather than a real agent.',
      'The stub performs no analysis, makes no decisions, and reaches no',
      'conclusions. It exists purely so the orchestration, validation, review,',
      'and state-transition machinery can be exercised without spending money',
      'on model calls. Replace the executor to obtain real output.',
      '',
    ];

    if (isReviewInvocation(invocation.outputPath)) {
      lines.push(
        '<!-- AEOS-VERDICT',
        'verdict: APPROVED',
        'blockers: 0',
        'warnings: 0',
        'info: 0',
        '-->',
        '',
      );
    }

    const content = lines.join('\n');

    invocation.onChunk?.('stdout', content);

    await fs.mkdir(path.dirname(invocation.outputPath), { recursive: true });
    await fs.writeFile(invocation.outputPath, content, 'utf8');

    return {
      ok: true,
      artifactPath: invocation.outputPath,
      content,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
  }

  async interrupt(): Promise<void> {
    // StubExecutor completes synchronously; nothing to interrupt.
  }
}
