// Application service — PreflightService (pre-flight pass before main column run)

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { Executor } from '../../domain/ports/driven/executor.port.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import type { StateMachineService } from '../../domain/services/state-machine.js';
import type { ColumnSpec } from '../../domain/model/column-spec.js';
import type { AgentSpec } from '../../domain/model/agent-spec.js';
import type { AssembledContext } from '../../domain/model/assembled-context.js';
import { type Column, isValidColumn } from '../../domain/model/column.js';
import { buildContextSection } from './prompt-builder.js';

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
    assembledContext: AssembledContext,
    columnSpec: ColumnSpec,
    workerAgentSpec: AgentSpec,
  ): Promise<PreflightResult> {
    // 1. Short-circuit if preflight is disabled
    if (!columnSpec.preflight.enabled) {
      return { blocked: false };
    }

    // 2. Build the preflight-specific prompt
    const prompt = this.buildPrompt(ticketId, assembledContext, columnSpec, workerAgentSpec);

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

    // 6. Parse output — check for NO_BLOCKERS on the first meaningful line
    if (this.isNoBlockersResponse(content)) {
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

  private buildPrompt(
    ticketId: string,
    assembledContext: AssembledContext,
    columnSpec: ColumnSpec,
    workerAgentSpec: AgentSpec,
  ): string {
    return [
      `[ROLE]\n${workerAgentSpec.systemPrompt}\n\nYou are performing a preflight blocker analysis before artifact generation.`,
      buildContextSection(assembledContext),
      [
        '[TASK]',
        `Identify only net-new blocking questions that would prevent producing a high-quality ${columnSpec.outputArtifact}.`,
        'Consult settled decisions first and do not re-ask already settled topics.',
        'If an older decision is insufficient, cite the contradiction or gap explicitly.',
        'If there are no blockers, respond with exactly: NO_BLOCKERS',
      ].join('\n'),
      [
        '[OUTPUT FORMAT]',
        'Either exactly "NO_BLOCKERS" or a structured markdown document in this format:',
        '# AEOS Questions',
        'Format-Version: 2',
        `Ticket: ${ticketId}`,
        `Stage: ${columnSpec.column}`,
        'Generated-By: preflight',
        '',
        'For each blocker use:',
        '## Q-001',
        'Status: OPEN',
        'Topic: short-kebab-topic',
        'Required: yes',
        '',
        '### Question',
        '```text',
        '<question text>',
        '```',
        '',
        '### Answer',
        '```text',
        '```',
      ].join('\n'),
    ].join('\n');
  }

  private resolveColumn(columnString: string): Column {
    if (isValidColumn(columnString)) {
      return columnString;
    }
    throw new Error(`Invalid column value: ${columnString}`);
  }

  private isNoBlockersResponse(content: string): boolean {
    const firstMeaningfulLine = content
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    return firstMeaningfulLine === 'NO_BLOCKERS';
  }
}
