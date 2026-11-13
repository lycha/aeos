// Web — the write path for answer/resolve forms (tech spec §2.6): a parsed,
// one-field-per-question view of `<id>-questions.md` / `<id>-escalation.md`,
// and a staleness-guarded write back into those exact files.
//
// Per WEB-1 decision D-001 (NEW-4): writeAnswers/writeResolution do ONLY the
// staleness-checked file write and return `{ok:true} | {ok:false,
// reason:'STALE_CONTENT'}`. They never call cli-proxy.runCommand — the route
// layer (T-010) invokes `ticket answer`/`ticket resolve` after a successful
// write.

import { FsArtifactStore } from '../infrastructure/filesystem/fs-artifact-store.adapter.js';
import {
  listQuestions,
  fillAnswers,
  type QuestionField,
} from '../application/services/decision-promotion.service.js';
import {
  escalationFilename,
  fillEscalationResponse,
} from '../application/services/escalation-document.js';
import { sha256Hex } from './staleness.js';

const artifactStore = new FsArtifactStore();

function questionsFilename(ticketId: string): string {
  return `${ticketId}-questions.md`;
}

export interface QuestionsDocument {
  readonly questions: QuestionField[];
  readonly staleness: string;
}

/** The current questions file, parsed field-by-field, or null when there is none. */
export function readQuestions(projectPath: string, ticketId: string): QuestionsDocument | null {
  const filename = questionsFilename(ticketId);
  if (!artifactStore.artifactExists(projectPath, ticketId, filename)) return null;
  const content = artifactStore.readArtifact(projectPath, ticketId, filename);
  return { questions: listQuestions(content), staleness: sha256Hex(content) };
}

export interface EscalationDocument {
  readonly reason: string;
  readonly why: string;
  readonly staleness: string;
}

/** The current escalation file's reason and "Why" text, or null when there is none. */
export function readEscalation(projectPath: string, ticketId: string): EscalationDocument | null {
  const filename = escalationFilename(ticketId);
  if (!artifactStore.artifactExists(projectPath, ticketId, filename)) return null;
  const content = artifactStore.readArtifact(projectPath, ticketId, filename);
  return {
    reason: extractReason(content),
    why: extractWhy(content),
    staleness: sha256Hex(content),
  };
}

export type WriteResult = { ok: true } | { ok: false; reason: 'STALE_CONTENT' };

/**
 * Re-reads the questions file, and only when its current hash still matches
 * `staleness` fills in `answers` and overwrites it (AC-19). A mismatch
 * writes nothing.
 */
export function writeAnswers(
  projectPath: string,
  ticketId: string,
  staleness: string,
  answers: Record<string, string>,
): WriteResult {
  const filename = questionsFilename(ticketId);
  const content = artifactStore.readArtifact(projectPath, ticketId, filename);
  if (sha256Hex(content) !== staleness) return { ok: false, reason: 'STALE_CONTENT' };
  artifactStore.writeArtifact(projectPath, ticketId, filename, fillAnswers(content, answers));
  return { ok: true };
}

/** Symmetric to `writeAnswers`, for the escalation file's `## Response` block. */
export function writeResolution(
  projectPath: string,
  ticketId: string,
  staleness: string,
  response: string,
): WriteResult {
  const filename = escalationFilename(ticketId);
  const content = artifactStore.readArtifact(projectPath, ticketId, filename);
  if (sha256Hex(content) !== staleness) return { ok: false, reason: 'STALE_CONTENT' };
  artifactStore.writeArtifact(
    projectPath,
    ticketId,
    filename,
    fillEscalationResponse(content, response),
  );
  return { ok: true };
}

function extractReason(content: string): string {
  return content.match(/^Reason:\s*(.*)$/m)?.[1]?.trim() ?? '';
}

function extractWhy(content: string): string {
  const idx = content.indexOf('## Why');
  if (idx === -1) return '';
  const after = content.slice(idx + '## Why'.length);
  const nextHeadingIdx = after.search(/\n## /);
  const section = nextHeadingIdx === -1 ? after : after.slice(0, nextHeadingIdx);
  return section.trim();
}
