// CLI contract — the structure of `cli-contract.yaml`, after its `$ref`s are
// resolved. The header of that file is the reference for the format. An
// unknown key is an error: the file is edited by hand.

import { z } from 'zod';

const Status = z.enum(['existing', 'proposed']);
/** Present on anything Iteration 1 adds: `status: proposed` and the task that adds it. */
const Lifecycle = { status: Status.optional(), task: z.string().min(1).optional() };
/** A JSON Schema. Not validated here: `schemaProblems` (contract-output.fixture.ts) does, in tests. */
const JsonSchema = z.record(z.string(), z.unknown());

const ParameterSchema = z.strictObject({
  name: z.string().min(1),
  in: z.enum(['argument', 'option', 'flag']),
  position: z.number().int().positive().optional(),
  required: z.boolean().optional(),
  valueName: z.string().min(1).optional(),
  description: z.string().min(1),
  pending: z.strictObject({ task: z.string().min(1), description: z.string().min(1) }).optional(),
  separator: z.string().min(1).optional(),
  schema: JsonSchema.optional(),
  ...Lifecycle,
});

const ResponseSchema = z.strictObject({
  description: z.string().min(1),
  data: JsonSchema.optional(),
});

const CommandSchema = z.strictObject({
  operationId: z.string().min(1),
  summary: z.string().min(1),
  pending: z.strictObject({ task: z.string().min(1), summary: z.string().min(1) }).optional(),
  requires: z.array(z.string()),
  conditionalRequires: z
    .array(z.strictObject({ resource: z.string(), when: z.string().min(1), ...Lifecycle }))
    .optional(),
  prompt: z.strictObject({ when: z.string().min(1), nonInteractive: z.string().min(1) }).optional(),
  parameters: z.array(ParameterSchema),
  responses: z.record(z.string(), ResponseSchema),
  ...Lifecycle,
});

export const ContractSchema = z.strictObject({
  contractVersion: z.number().int(),
  info: z.strictObject({
    title: z.string(),
    binary: z.string(),
    summary: z.string(),
    license: z.string(),
    runtime: z.string(),
  }),
  platforms: z.array(z.string()),
  environment: z.record(
    z.string(),
    z.strictObject({
      description: z.string().min(1),
      default: z.string().optional(),
      schema: JsonSchema,
    }),
  ),
  resources: z.record(
    z.string(),
    z.strictObject({ description: z.string().min(1), fix: z.string().min(1), ...Lifecycle }),
  ),
  exitCodes: z.record(z.string(), z.strictObject({ name: z.string(), meaning: z.string() })),
  output: z.strictObject({
    formats: z.array(z.string()),
    default: z.string(),
    json: z.strictObject({ mediaType: z.string(), envelope: JsonSchema }),
    nonInteractive: z.string(),
  }),
  globals: z.strictObject({
    parameters: z.array(ParameterSchema),
    responses: z.record(z.string(), ResponseSchema),
  }),
  components: z.strictObject({
    parameters: z.record(z.string(), ParameterSchema),
    responses: z.record(z.string(), ResponseSchema),
    schemas: z.record(z.string(), JsonSchema),
  }),
  commands: z.record(z.string(), CommandSchema),
});

export type Contract = z.infer<typeof ContractSchema>;
export type ContractCommand = Contract['commands'][string];
export type ContractParameter = ContractCommand['parameters'][number];
