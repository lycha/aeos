// Zod schemas for runtime validation of YAML spec files.
// These produce types compatible with the domain interfaces (ColumnSpec, AgentSpec).

import { z } from 'zod';

export const ColumnSpecSchema = z.object({
  column: z.string().min(1),
  // Length and uniqueness are checked across all columns, in `labelErrors`.
  label: z.string().optional(),
  executorMode: z.enum(['artifact', 'agentic']).optional(),
  requiresRepoDiff: z.boolean().optional(),
  runChecks: z.boolean().optional(),
  workerAgentFile: z.string().min(1),
  reviewerAgentFile: z.string().min(1),
  outputArtifact: z.string().min(1),
  minWordCount: z.number().int().positive().default(50),
  requiredSections: z.array(z.string()).default([]),
  reviewerRubrics: z.array(z.string()).default([]),
  // Optional on purpose: absent means "inherit the global reviewLoop cap".
  // A schema default would make "unset" indistinguishable from an explicit value.
  maxIterations: z.number().int().positive().optional(),
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
    type: z.enum(['claude-cli', 'auggie-cli', 'opencode-cli', 'ollama-cli', 'stub']),
    model: z.string().optional(),
    timeoutSeconds: z.number().int().positive().default(300),
  }),
});

/** The `checks` list of `.aeos/project.json`. */
export const ProjectChecksSchema = z.array(
  z.object({
    name: z.string().min(1),
    command: z.string().min(1),
    timeoutSeconds: z.number().positive(),
  }),
);

/** The `protectedPaths` list of `.aeos/project.json`. */
export const ProjectProtectedPathsSchema = z.array(z.string().min(1));

/** The `criteria` object of `.aeos/project.json`. */
export const ProjectCriteriaSchema = z.looseObject({
  testGlobs: z.array(z.string().min(1)).optional(),
  testReport: z
    .object({
      command: z.string().min(1),
      path: z.string().min(1),
      format: z.enum(['vitest-json']),
    })
    .optional(),
});

/** The `pullRequests` object of `.aeos/project.json`. */
export const ProjectPullRequestsSchema = z.object({ enabled: z.boolean().optional() });
