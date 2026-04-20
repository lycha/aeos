// Application service — deterministic promotion from questions.md to decisions.md

import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';

const QUESTIONS_FORMAT_VERSION = '2';
const DECISIONS_FORMAT_VERSION = '1';

export interface DecisionPromotionInput {
  projectPath: string;
  ticketId: string;
  stage: string;
  settledBy: 'human';
  settledAt?: string;
}

export interface DecisionPromotionResult {
  status: 'promoted' | 'legacy-skipped' | 'validation-error';
  decisionsPath: string | null;
  createdDecisionIds: string[];
  updatedDecisionIds: string[];
  supersededDecisionIds: string[];
  warnings: string[];
  error?: string;
}

interface ParsedQuestion {
  id: string;
  status: string;
  topic: string;
  required: string | null;
  stage: string | null;
  type: string | null;
  question: string;
  answer: string;
  notes: string | null;
}

interface ParsedDecision {
  id: string;
  source: string;
  topic: string;
  status: string;
  stageSettled: string | null;
  settledBy: string;
  settledAt: string;
  decision: string;
  supersedes: string | null;
  notes: string | null;
}

export class DecisionPromotionService {
  constructor(private readonly artifactStore: ArtifactStore) {}

  promote(input: DecisionPromotionInput): DecisionPromotionResult {
    const questionsFilename = `${input.ticketId}-questions.md`;
    const decisionsFilename = `${input.ticketId}-decisions.md`;
    const questionsContent = this.artifactStore.readArtifact(
      input.projectPath,
      input.ticketId,
      questionsFilename,
    );

    const questionsVersion = extractScalar(questionsContent, 'Format-Version');
    if (questionsVersion !== QUESTIONS_FORMAT_VERSION) {
      return {
        status: 'legacy-skipped',
        decisionsPath: null,
        createdDecisionIds: [],
        updatedDecisionIds: [],
        supersededDecisionIds: [],
        warnings: ['Questions file is legacy or unsupported; skipped decision promotion.'],
      };
    }

    try {
      const parsedQuestions = parseQuestionFile(questionsContent);
      const missingRequiredAnswers = parsedQuestions.filter(
        (question) => isRequired(question.required) && question.answer.trim().length === 0,
      );
      if (missingRequiredAnswers.length > 0) {
        return validationError(
          `Missing required answers for: ${missingRequiredAnswers.map((q) => q.id).join(', ')}`,
        );
      }

      const answeredQuestions = parsedQuestions.filter(
        (question) => question.answer.trim().length > 0,
      );
      if (answeredQuestions.length === 0) {
        return validationError('No answered questions found in structured questions file.');
      }

      const existingDecisions = this.artifactStore.artifactExists(
        input.projectPath,
        input.ticketId,
        decisionsFilename,
      )
        ? parseDecisionFile(
            this.artifactStore.readArtifact(input.projectPath, input.ticketId, decisionsFilename),
          )
        : [];

      const decisions = existingDecisions.map((decision) => ({ ...decision }));
      const createdDecisionIds: string[] = [];
      const updatedDecisionIds: string[] = [];
      const supersededDecisionIds: string[] = [];
      let nextDecisionNumber = getNextDecisionNumber(decisions);
      const settledAt = input.settledAt ?? new Date().toISOString();

      for (const question of answeredQuestions) {
        let currentDecision = decisions.find((decision) => decision.source === question.id) ?? null;

        if (!currentDecision) {
          currentDecision = {
            id: formatDecisionId(nextDecisionNumber++),
            source: question.id,
            topic: question.topic,
            status: 'SETTLED',
            stageSettled: input.stage,
            settledBy: input.settledBy,
            settledAt,
            decision: question.answer,
            supersedes: null,
            notes: null,
          };
          decisions.push(currentDecision);
          createdDecisionIds.push(currentDecision.id);
        } else {
          currentDecision.source = question.id;
          currentDecision.topic = question.topic;
          currentDecision.status = 'SETTLED';
          currentDecision.stageSettled = input.stage;
          currentDecision.settledBy = input.settledBy;
          currentDecision.settledAt = settledAt;
          currentDecision.decision = question.answer;
          if (!updatedDecisionIds.includes(currentDecision.id)) {
            updatedDecisionIds.push(currentDecision.id);
          }
        }

        const priorActiveDecision = decisions.find(
          (decision) =>
            decision.id !== currentDecision.id &&
            decision.topic === question.topic &&
            decision.status !== 'SUPERSEDED',
        );

        if (priorActiveDecision) {
          priorActiveDecision.status = 'SUPERSEDED';
          currentDecision.supersedes = priorActiveDecision.id;
          if (!supersededDecisionIds.includes(priorActiveDecision.id)) {
            supersededDecisionIds.push(priorActiveDecision.id);
          }
        }
      }

      this.artifactStore.writeArtifact(
        input.projectPath,
        input.ticketId,
        decisionsFilename,
        renderDecisionFile(input.ticketId, decisions),
      );

      return {
        status: 'promoted',
        decisionsPath: decisionsFilename,
        createdDecisionIds,
        updatedDecisionIds,
        supersededDecisionIds,
        warnings: [],
      };
    } catch (error) {
      return validationError(error instanceof Error ? error.message : String(error));
    }
  }
}

function validationError(error: string): DecisionPromotionResult {
  return {
    status: 'validation-error',
    decisionsPath: null,
    createdDecisionIds: [],
    updatedDecisionIds: [],
    supersededDecisionIds: [],
    warnings: [],
    error,
  };
}

function parseQuestionFile(content: string): ParsedQuestion[] {
  const formatVersion = extractScalar(content, 'Format-Version');
  if (formatVersion !== QUESTIONS_FORMAT_VERSION) {
    throw new Error(`Unsupported questions format version: ${formatVersion ?? 'missing'}`);
  }

  return splitBlocks(content, /^## (Q-[0-9]+)\s*$/gm).map(parseQuestionBlock);
}

function parseDecisionFile(content: string): ParsedDecision[] {
  const formatVersion = extractScalar(content, 'Format-Version');
  if (formatVersion !== DECISIONS_FORMAT_VERSION) {
    throw new Error(`Unsupported decisions format version: ${formatVersion ?? 'missing'}`);
  }

  return splitBlocks(content, /^## (D-[0-9]+)\s*$/gm).map(parseDecisionBlock);
}

function splitBlocks(content: string, headingPattern: RegExp): string[] {
  const matches = [...content.matchAll(headingPattern)];
  if (matches.length === 0) {
    throw new Error('No structured blocks found.');
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end =
      index + 1 < matches.length ? (matches[index + 1].index ?? content.length) : content.length;
    return content.slice(start, end).trimEnd();
  });
}

function parseQuestionBlock(block: string): ParsedQuestion {
  const parsed = parseBlock(block, 'Q', ['Status', 'Topic'], ['Question', 'Answer']);
  return {
    id: parsed.id,
    status: parsed.scalars.Status,
    topic: parsed.scalars.Topic,
    required: parsed.scalars.Required ?? null,
    stage: parsed.scalars.Stage ?? null,
    type: parsed.scalars.Type ?? null,
    question: parsed.sections.Question,
    answer: parsed.sections.Answer,
    notes: parsed.sections.Notes ?? null,
  };
}

function parseDecisionBlock(block: string): ParsedDecision {
  const parsed = parseBlock(
    block,
    'D',
    ['Source', 'Topic', 'Status', 'SettledBy', 'SettledAt'],
    ['Decision'],
  );
  return {
    id: parsed.id,
    source: parsed.scalars.Source,
    topic: parsed.scalars.Topic,
    status: parsed.scalars.Status,
    stageSettled: parsed.scalars.StageSettled ?? null,
    settledBy: parsed.scalars.SettledBy,
    settledAt: parsed.scalars.SettledAt,
    decision: parsed.sections.Decision,
    supersedes: parsed.scalars.Supersedes ?? null,
    notes: parsed.sections.Notes ?? null,
  };
}

function parseBlock(
  block: string,
  prefix: 'Q' | 'D',
  requiredScalars: string[],
  requiredSections: string[],
): { id: string; scalars: Record<string, string>; sections: Record<string, string> } {
  const lines = block.split('\n');
  const heading = lines[0]?.trim() ?? '';
  const headingMatch = heading.match(new RegExp(`^## (${prefix}-[0-9]+)$`));
  if (!headingMatch) {
    throw new Error(`Malformed ${prefix} block heading: ${heading || '(missing)'}`);
  }

  const scalars: Record<string, string> = {};
  const sections: Record<string, string> = {};

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      continue;
    }

    const scalarMatch = trimmed.match(/^([A-Za-z][A-Za-z-]*):\s*(.*)$/);
    if (scalarMatch) {
      scalars[scalarMatch[1]] = scalarMatch[2];
      continue;
    }

    const sectionMatch = trimmed.match(/^### (Question|Answer|Decision|Notes)$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1];
      const fenceStart = lines[i + 1]?.trim() ?? '';
      if (fenceStart !== '```text') {
        throw new Error(`Expected \`\`\`text fence after ${sectionName} in ${headingMatch[1]}`);
      }

      const fenceLines: string[] = [];
      let foundFenceEnd = false;
      i += 2;
      for (; i < lines.length; i += 1) {
        const fenceLine = lines[i] ?? '';
        if (fenceLine.trim() === '```') {
          foundFenceEnd = true;
          break;
        }
        fenceLines.push(fenceLine);
      }

      if (!foundFenceEnd) {
        throw new Error(`Unterminated fenced block for ${sectionName} in ${headingMatch[1]}`);
      }

      sections[sectionName] = fenceLines.join('\n');
      continue;
    }

    throw new Error(`Unexpected content in ${headingMatch[1]}: ${trimmed}`);
  }

  for (const scalar of requiredScalars) {
    if (!(scalar in scalars)) {
      throw new Error(`Missing required field ${scalar} in ${headingMatch[1]}`);
    }
  }

  for (const section of requiredSections) {
    if (!(section in sections)) {
      throw new Error(`Missing required section ${section} in ${headingMatch[1]}`);
    }
  }

  return { id: headingMatch[1], scalars, sections };
}

function extractScalar(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${escapeRegex(key)}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRequired(required: string | null): boolean {
  if (required === null) {
    return false;
  }
  return ['yes', 'true', 'required'].includes(required.trim().toLowerCase());
}

function getNextDecisionNumber(decisions: ParsedDecision[]): number {
  const maxDecision = decisions.reduce((max, decision) => {
    const current = Number.parseInt(decision.id.replace('D-', ''), 10);
    return Number.isNaN(current) ? max : Math.max(max, current);
  }, 0);
  return maxDecision + 1;
}

function formatDecisionId(value: number): string {
  return `D-${String(value).padStart(3, '0')}`;
}

function renderDecisionFile(ticketId: string, decisions: ParsedDecision[]): string {
  const lines = [
    '# AEOS Decisions',
    `Format-Version: ${DECISIONS_FORMAT_VERSION}`,
    `Ticket: ${ticketId}`,
  ];
  const sortedDecisions = [...decisions].sort((a, b) => a.id.localeCompare(b.id));

  for (const decision of sortedDecisions) {
    lines.push('');
    lines.push(`## ${decision.id}`);
    lines.push(`Source: ${decision.source}`);
    lines.push(`Topic: ${decision.topic}`);
    lines.push(`Status: ${decision.status}`);
    if (decision.stageSettled) {
      lines.push(`StageSettled: ${decision.stageSettled}`);
    }
    lines.push(`SettledBy: ${decision.settledBy}`);
    lines.push(`SettledAt: ${decision.settledAt}`);
    if (decision.supersedes) {
      lines.push(`Supersedes: ${decision.supersedes}`);
    }
    lines.push('');
    lines.push('### Decision');
    lines.push('```text');
    lines.push(decision.decision);
    lines.push('```');
    if (decision.notes !== null) {
      lines.push('');
      lines.push('### Notes');
      lines.push('```text');
      lines.push(decision.notes);
      lines.push('```');
    }
  }

  lines.push('');
  return lines.join('\n');
}
