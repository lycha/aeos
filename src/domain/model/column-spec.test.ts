import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { ColumnSpecSchema } from './column-spec.js';

/** Minimal valid column spec input (only required fields). */
function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    column: 'product-scoping',
    workerAgentFile: 'agents/pm-agent.yaml',
    reviewerAgentFile: 'agents/reviewer-agent.yaml',
    outputArtifact: 'prd.md',
    ...overrides,
  };
}

describe('ColumnSpecSchema', () => {
  it('parses a valid column spec with all required fields', () => {
    const result = ColumnSpecSchema.parse(validInput());
    expect(result.column).toBe('product-scoping');
    expect(result.workerAgentFile).toBe('agents/pm-agent.yaml');
    expect(result.reviewerAgentFile).toBe('agents/reviewer-agent.yaml');
    expect(result.outputArtifact).toBe('prd.md');
  });

  it('throws ZodError when column is missing', () => {
    const input = validInput();
    delete input['column'];
    expect(() => ColumnSpecSchema.parse(input)).toThrow(ZodError);
  });

  it('throws ZodError when workerAgentFile is missing', () => {
    const input = validInput();
    delete input['workerAgentFile'];
    expect(() => ColumnSpecSchema.parse(input)).toThrow(ZodError);
  });

  it('throws ZodError when reviewerAgentFile is missing', () => {
    const input = validInput();
    delete input['reviewerAgentFile'];
    expect(() => ColumnSpecSchema.parse(input)).toThrow(ZodError);
  });

  it('applies default minWordCount of 50 when not provided', () => {
    const result = ColumnSpecSchema.parse(validInput());
    expect(result.minWordCount).toBe(50);
  });

  it('uses provided minWordCount when specified', () => {
    const result = ColumnSpecSchema.parse(validInput({ minWordCount: 100 }));
    expect(result.minWordCount).toBe(100);
  });

  it('applies default maxIterations of 3 when not provided', () => {
    const result = ColumnSpecSchema.parse(validInput());
    expect(result.maxIterations).toBe(3);
  });

  it('uses provided maxIterations when specified', () => {
    const result = ColumnSpecSchema.parse(validInput({ maxIterations: 5 }));
    expect(result.maxIterations).toBe(5);
  });

  it('applies default escalation of escalate_to_human', () => {
    const result = ColumnSpecSchema.parse(validInput());
    expect(result.escalation).toBe('escalate_to_human');
  });

  it('accepts escalation mark_done', () => {
    const result = ColumnSpecSchema.parse(validInput({ escalation: 'mark_done' }));
    expect(result.escalation).toBe('mark_done');
  });

  it('applies default advanceMode of manual', () => {
    const result = ColumnSpecSchema.parse(validInput());
    expect(result.advanceMode).toBe('manual');
  });

  it('throws ZodError for invalid advanceMode', () => {
    expect(() => ColumnSpecSchema.parse(validInput({ advanceMode: 'invalid' }))).toThrow(ZodError);
  });

  it('applies default empty arrays for requiredSections and reviewerRubrics', () => {
    const result = ColumnSpecSchema.parse(validInput());
    expect(result.requiredSections).toEqual([]);
    expect(result.reviewerRubrics).toEqual([]);
  });

  it('accepts optional phase field', () => {
    const result = ColumnSpecSchema.parse(validInput({ phase: 'PLAN' }));
    expect(result.phase).toBe('PLAN');
  });

  it('throws ZodError for invalid phase', () => {
    expect(() => ColumnSpecSchema.parse(validInput({ phase: 'INVALID' }))).toThrow(ZodError);
  });

  it('applies default preflight config when not provided', () => {
    const result = ColumnSpecSchema.parse(validInput());
    expect(result.preflight.enabled).toBe(true);
    expect(result.preflight.questionsArtifact).toBe('questions.md');
  });

  it('accepts custom preflight config', () => {
    const result = ColumnSpecSchema.parse(
      validInput({ preflight: { enabled: false, questionsArtifact: 'custom.md' } }),
    );
    expect(result.preflight.enabled).toBe(false);
    expect(result.preflight.questionsArtifact).toBe('custom.md');
  });

  it('returns workerAgentFile and reviewerAgentFile paths', () => {
    const result = ColumnSpecSchema.parse(
      validInput({
        workerAgentFile: 'agents/worker.yaml',
        reviewerAgentFile: 'agents/reviewer.yaml',
      }),
    );
    expect(result.workerAgentFile).toBe('agents/worker.yaml');
    expect(result.reviewerAgentFile).toBe('agents/reviewer.yaml');
  });
});
