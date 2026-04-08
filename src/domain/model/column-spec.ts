// Value Object — ColumnSpec (loaded from YAML: agent, output artifact, rubrics, preflight config)

import { z } from 'zod';

export const ColumnSpecSchema = z.object({
  column: z.string().min(1),
  phase: z.enum(['PLAN', 'PREPARE', 'BUILD', 'DEPLOY']).optional(),
  workerAgentFile: z.string().min(1), // relative path to worker agent YAML, e.g. "agents/pm-agent.yaml"
  reviewerAgentFile: z.string().min(1), // relative path to reviewer agent YAML, e.g. "agents/reviewer-agent.yaml"
  outputArtifact: z.string().min(1), // artifact name, e.g. "prd.md"
  minWordCount: z.number().int().positive().default(50),
  requiredSections: z.array(z.string()).default([]),
  reviewerRubrics: z.array(z.string()).default([]), // paths to rubric .md files
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

export type ColumnSpec = Readonly<z.infer<typeof ColumnSpecSchema>>;
