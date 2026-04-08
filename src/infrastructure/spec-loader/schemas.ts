// Zod schemas for runtime validation of YAML spec files.
// These produce types compatible with the domain interfaces (ColumnSpec, AgentSpec).

import { z } from 'zod';

export const ColumnSpecSchema = z.object({
  column: z.string().min(1),
  phase: z.enum(['PLAN', 'PREPARE', 'BUILD', 'DEPLOY']).optional(),
  workerAgentFile: z.string().min(1),
  reviewerAgentFile: z.string().min(1),
  outputArtifact: z.string().min(1),
  minWordCount: z.number().int().positive().default(50),
  requiredSections: z.array(z.string()).default([]),
  reviewerRubrics: z.array(z.string()).default([]),
  maxIterations: z.number().int().positive().default(3),
  escalation: z.enum(['escalate_to_human', 'mark_done']).default('escalate_to_human'),
  advanceMode: z.enum(['manual', 'auto']).default('manual'),
  preflight: z
    .object({
      enabled: z.boolean().default(true),
      questionsArtifact: z.string().default('questions.md'),
    })
    .default({ enabled: true, questionsArtifact: 'questions.md' }),
});

export const AgentSpecSchema = z.object({
  name: z.string().min(1),
  role: z.enum(['worker', 'reviewer']).optional(),
  systemPrompt: z.string().min(1),
  taskInstruction: z.string().min(1),
  outputFormat: z.string().min(1),
  selfVerificationChecklist: z.array(z.string()).default([]),
  executor: z.object({
    type: z.enum(['claude-cli', 'stub']),
    model: z.string().optional(),
    timeoutSeconds: z.number().int().positive().default(300),
  }),
});
