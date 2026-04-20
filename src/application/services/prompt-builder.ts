// Application service — PromptBuilder: transforms AssembledContext into a final prompt string

import type { AssembledContext } from '../../domain/model/assembled-context.js';
import type { AgentSpec } from '../../domain/model/agent-spec.js';

/**
 * Builds the final prompt string from an assembled context and agent specification.
 *
 * Prompt structure (in order):
 *   [ROLE] → [CONTEXT] → [TASK] → [OUTPUT FORMAT] → [SELF-VERIFICATION]
 *
 * Pure function — no side effects, no dependencies.
 */
export function buildPrompt(context: AssembledContext, agentSpec: AgentSpec): string {
  const sections: string[] = [];

  // [ROLE]
  sections.push(`[ROLE]\n${agentSpec.systemPrompt}`);

  // [CONTEXT]
  sections.push(buildContextSection(context));

  // [TASK]
  sections.push(`[TASK]\n${agentSpec.taskInstruction}`);

  // [OUTPUT FORMAT]
  sections.push(`[OUTPUT FORMAT]\n${agentSpec.outputFormat}`);

  // [SELF-VERIFICATION] — omit entirely if checklist is empty
  if (agentSpec.selfVerificationChecklist.length > 0) {
    const checklist = agentSpec.selfVerificationChecklist.map((item) => `- ${item}`).join('\n');
    sections.push(`[SELF-VERIFICATION]\nBefore submitting your response, verify:\n${checklist}`);
  }

  return sections.join('\n\n');
}

export function buildContextSection(context: AssembledContext): string {
  const parts: string[] = [];

  parts.push('[CONTEXT]');

  // Ticket
  parts.push(`## Ticket\n${context.ticketContent}`);

  // Settled Decisions — omit section entirely if null
  if (context.settledDecisions !== null) {
    parts.push(`## Settled Decisions\n${context.settledDecisions}`);
  }

  // Prior Artifacts — omit section entirely if empty
  if (context.priorArtifacts.length > 0) {
    const artifactParts = context.priorArtifacts
      .map((artifact) => `### ${artifact.name}\n${artifact.content}`)
      .join('\n\n');
    parts.push(`## Prior Artifacts\n${artifactParts}`);
  }

  // Code Diff — omit section entirely if null
  if (context.codeDiff !== null) {
    parts.push(`## Code Diff\n${context.codeDiff}`);
  }

  // Constraints
  parts.push(`## Constraints\n${context.constraints ?? '(none)'}`);

  return parts.join('\n\n');
}
