import { describe, it, expect } from 'vitest';
import { buildPrompt } from './prompt-builder.js';
import type { AssembledContext } from '../../domain/model/assembled-context.js';
import type { AgentSpec } from '../../domain/model/agent-spec.js';

function createAgentSpec(overrides: Partial<AgentSpec> = {}): AgentSpec {
  return {
    name: 'test-agent',
    systemPrompt: 'You are an expert software architect.',
    taskInstruction: 'Produce a technical design document.',
    outputFormat: 'Markdown with H2 sections.',
    selfVerificationChecklist: ['All requirements addressed', 'No TODOs remain'],
    executor: { type: 'stub', timeoutSeconds: 300 },
    ...overrides,
  };
}

function createContext(overrides: Partial<AssembledContext> = {}): AssembledContext {
  return {
    ticketContent: '# AEOS-1\nImplement feature X',
    priorArtifacts: [],
    constraints: null,
    ...overrides,
  };
}

describe('buildPrompt', () => {
  it('produces all 5 sections in correct order for a full context', () => {
    const context = createContext({
      priorArtifacts: [
        { name: 'AEOS-1-prd.md', content: '# PRD content' },
        { name: 'AEOS-1-tech-spec.md', content: '# Tech Spec content' },
      ],
      constraints: 'Use TypeScript strict mode',
    });
    const spec = createAgentSpec();

    const result = buildPrompt(context, spec);

    const roleIdx = result.indexOf('[ROLE]');
    const contextIdx = result.indexOf('[CONTEXT]');
    const taskIdx = result.indexOf('[TASK]');
    const outputIdx = result.indexOf('[OUTPUT FORMAT]');
    const verifyIdx = result.indexOf('[SELF-VERIFICATION]');

    expect(roleIdx).toBeGreaterThanOrEqual(0);
    expect(contextIdx).toBeGreaterThan(roleIdx);
    expect(taskIdx).toBeGreaterThan(contextIdx);
    expect(outputIdx).toBeGreaterThan(taskIdx);
    expect(verifyIdx).toBeGreaterThan(outputIdx);
  });

  it('includes both prior artifacts under [CONTEXT] → ## Prior Artifacts', () => {
    const context = createContext({
      priorArtifacts: [
        { name: 'AEOS-1-prd.md', content: '# PRD content' },
        { name: 'AEOS-1-tech-spec.md', content: '# Tech Spec content' },
      ],
    });
    const spec = createAgentSpec();

    const result = buildPrompt(context, spec);

    expect(result).toContain('## Prior Artifacts');
    expect(result).toContain('### AEOS-1-prd.md\n# PRD content');
    expect(result).toContain('### AEOS-1-tech-spec.md\n# Tech Spec content');
  });

  it('shows (none) for constraints when constraints is null', () => {
    const context = createContext({ constraints: null });
    const spec = createAgentSpec();

    const result = buildPrompt(context, spec);

    expect(result).toContain('## Constraints\n(none)');
  });

  it('omits ## Prior Artifacts section when priorArtifacts is empty', () => {
    const context = createContext({ priorArtifacts: [] });
    const spec = createAgentSpec();

    const result = buildPrompt(context, spec);

    expect(result).not.toContain('## Prior Artifacts');
  });

  it('omits [SELF-VERIFICATION] section when selfVerificationChecklist is empty', () => {
    const context = createContext();
    const spec = createAgentSpec({ selfVerificationChecklist: [] });

    const result = buildPrompt(context, spec);

    expect(result).not.toContain('[SELF-VERIFICATION]');
  });

  it('includes system prompt in [ROLE] section', () => {
    const spec = createAgentSpec({ systemPrompt: 'You are a PRD writer.' });
    const result = buildPrompt(createContext(), spec);

    expect(result).toContain('[ROLE]\nYou are a PRD writer.');
  });

  it('includes task instruction in [TASK] section', () => {
    const spec = createAgentSpec({ taskInstruction: 'Write the PRD.' });
    const result = buildPrompt(createContext(), spec);

    expect(result).toContain('[TASK]\nWrite the PRD.');
  });

  it('includes output format in [OUTPUT FORMAT] section', () => {
    const spec = createAgentSpec({ outputFormat: 'JSON object.' });
    const result = buildPrompt(createContext(), spec);

    expect(result).toContain('[OUTPUT FORMAT]\nJSON object.');
  });

  it('renders selfVerificationChecklist as bulleted list', () => {
    const spec = createAgentSpec({
      selfVerificationChecklist: ['Check A', 'Check B', 'Check C'],
    });
    const result = buildPrompt(createContext(), spec);

    expect(result).toContain('- Check A\n- Check B\n- Check C');
  });

  it('includes ticket content under ## Ticket', () => {
    const context = createContext({ ticketContent: '# My Ticket\nDescription here' });
    const result = buildPrompt(context, createAgentSpec());

    expect(result).toContain('## Ticket\n# My Ticket\nDescription here');
  });

  it('shows constraints content when constraints is provided', () => {
    const context = createContext({ constraints: 'Must use PostgreSQL' });
    const result = buildPrompt(context, createAgentSpec());

    expect(result).toContain('## Constraints\nMust use PostgreSQL');
  });

  it('produces structurally valid output when string fields are empty', () => {
    const spec = createAgentSpec({
      systemPrompt: '',
      taskInstruction: '',
      outputFormat: '',
    });
    const context = createContext({ ticketContent: '' });

    const result = buildPrompt(context, spec);

    expect(result).toContain('[ROLE]\n');
    expect(result).toContain('[TASK]\n');
    expect(result).toContain('[OUTPUT FORMAT]\n');
    expect(result).toContain('## Ticket\n');
  });
});
