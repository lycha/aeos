// Value Object — AgentSpec (loaded from YAML: system prompt, task instruction, output format, executor config)

import { z } from 'zod';

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

export type AgentSpec = Readonly<z.infer<typeof AgentSpecSchema>>;
