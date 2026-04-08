// Application service — PreflightService (pre-flight pass before main column run)

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { Executor } from '../../domain/ports/driven/executor.port.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import type { StateMachineService } from '../../domain/services/state-machine.js';
import type { ColumnSpec } from '../../domain/model/column-spec.js';
import { type Column, isValidColumn } from '../../domain/model/column.js';

export type PreflightResult = { blocked: false } | { blocked: true; questionsPath: string };

export class PreflightService {
  constructor(
    private readonly executor: Executor,
    private readonly artifactStore: ArtifactStore,
    private readonly stateMachine: StateMachineService,
  ) {}

  async run(
    ticketId: string,
    projectId: string,
    projectPath: string,
    ticketContent: string,
    columnSpec: ColumnSpec,
  ): Promise<PreflightResult> {
    // 1. Short-circuit if preflight is disabled
    if (!columnSpec.preflight.enabled) {
      return { blocked: false };
    }

    // 2. Build the preflight-specific prompt
    const prompt = this.buildPrompt(ticketContent, columnSpec.outputArtifact);

    // 3. Derive column enum value from columnSpec.column string
    const column = this.resolveColumn(columnSpec.column);

    // 4. Construct executor invocation and run
    const tempPath = join(tmpdir(), `preflight-${ticketId}-${randomUUID()}.md`);
    const result = await this.executor.run({
      prompt,
      outputPath: tempPath,
      ticketId,
      column,
    });

    // 5. Check executor result
    if (!result.ok) {
      throw new Error(`Preflight executor failed: ${result.reason}`);
    }

    const content = result.content ?? '';

    // 6. Parse output — check for NO_BLOCKERS
    if (content.trim() === 'NO_BLOCKERS') {
      return { blocked: false };
    }

    // 7. Blocked — write questions artifact and update sub-state
    const questionsFilename = `${ticketId}-${columnSpec.preflight.questionsArtifact}`;
    this.artifactStore.writeArtifact(projectPath, ticketId, questionsFilename, content);
    const subStateResult = this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
    if (!subStateResult.ok) {
      throw new Error(`Failed to set BLOCKED sub-state: ${subStateResult.reason}`);
    }

    return { blocked: true, questionsPath: questionsFilename };
  }

  private buildPrompt(ticketContent: string, outputArtifact: string): string {
    return [
      '[ROLE] You are a requirements analyst.',
      `[CONTEXT] ${ticketContent}`,
      `[TASK] Identify any blocking questions that, if unanswered, would prevent you from producing a high-quality ${outputArtifact}. If there are no blockers, respond with exactly: NO_BLOCKERS`,
      '[OUTPUT FORMAT] Either: "NO_BLOCKERS" or a numbered list of questions.',
    ].join('\n');
  }

  private resolveColumn(columnString: string): Column {
    if (isValidColumn(columnString)) {
      return columnString;
    }
    throw new Error(`Invalid column value: ${columnString}`);
  }
}
