// Criteria traced here: @AC-18 (record the answer/response) @AC-37 (staleness-guarded write, separate from running the command).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildEscalationDocument } from '../application/services/escalation-document.js';
import { sha256Hex } from './staleness.js';
import { readEscalation, readQuestions, writeAnswers, writeResolution } from './qa-documents.js';

const QUESTIONS_DOC = [
  '# AEOS Questions',
  'Format-Version: 2',
  'Ticket: AEOS-1',
  'Stage: ARCH_SPIKE',
  'Generated-By: preflight',
  '',
  '## Q-001',
  'Status: OPEN',
  'Topic: executor-scope',
  'Required: yes',
  '',
  '### Question',
  '```text',
  'Which executors are in scope for v1?',
  '```',
  '',
  '### Answer',
  '```text',
  '',
  '```',
  '',
].join('\n');

let tmpDir: string;
let ticketDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-qa-documents-test-'));
  ticketDir = path.join(tmpDir, '.aeos', 'tickets', 'AEOS-1');
  fs.mkdirSync(ticketDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeQuestionsFile(content: string): string {
  const filePath = path.join(ticketDir, 'AEOS-1-questions.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function writeEscalationFile(content: string): string {
  const filePath = path.join(ticketDir, 'AEOS-1-escalation.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('readQuestions', () => {
  it('returns the parsed questions and the hash of the exact content read', () => {
    writeQuestionsFile(QUESTIONS_DOC);

    const result = readQuestions(tmpDir, 'AEOS-1');

    expect(result).not.toBeNull();
    expect(result?.staleness).toBe(sha256Hex(QUESTIONS_DOC));
    expect(result?.questions).toEqual([
      {
        id: 'Q-001',
        topic: 'executor-scope',
        required: true,
        question: 'Which executors are in scope for v1?',
        answer: '',
        notes: null,
      },
    ]);
  });

  it('returns null when there is no questions file', () => {
    expect(readQuestions(tmpDir, 'AEOS-1')).toBeNull();
  });
});

describe('readEscalation', () => {
  it('returns the reason, why text, and the hash of the exact content read', () => {
    const doc = buildEscalationDocument({
      ticketId: 'AEOS-1',
      column: 'CODE_REVIEW',
      reason: 'NOT_CONVERGING',
      message: 'Attempt 2 reproduced the same blockers.',
    });
    writeEscalationFile(doc);

    const result = readEscalation(tmpDir, 'AEOS-1');

    expect(result).toEqual({
      reason: 'NOT_CONVERGING',
      why: 'Attempt 2 reproduced the same blockers.',
      staleness: sha256Hex(doc),
    });
  });

  it('returns null when there is no escalation file', () => {
    expect(readEscalation(tmpDir, 'AEOS-1')).toBeNull();
  });
});

describe('writeAnswers', () => {
  it('writes the filled file and returns ok when the staleness matches', () => {
    const filePath = writeQuestionsFile(QUESTIONS_DOC);
    const staleness = sha256Hex(QUESTIONS_DOC);

    const result = writeAnswers(tmpDir, 'AEOS-1', staleness, {
      'Q-001': 'Support `claude` and `stub` only in v1.',
    });

    expect(result).toEqual({ ok: true });
    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).toContain('Support `claude` and `stub` only in v1.');
    expect(readQuestions(tmpDir, 'AEOS-1')?.questions[0]?.answer).toBe(
      'Support `claude` and `stub` only in v1.',
    );
  });

  it('writes nothing and returns STALE_CONTENT when the file changed on disk', () => {
    const filePath = writeQuestionsFile(QUESTIONS_DOC);
    const staleness = sha256Hex(QUESTIONS_DOC);
    const editedOnDisk = QUESTIONS_DOC.replace('Required: yes', 'Required: no');
    fs.writeFileSync(filePath, editedOnDisk, 'utf-8');

    const result = writeAnswers(tmpDir, 'AEOS-1', staleness, { 'Q-001': 'too late' });

    expect(result).toEqual({ ok: false, reason: 'STALE_CONTENT' });
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(editedOnDisk);
  });
});

describe('writeResolution', () => {
  const doc = buildEscalationDocument({
    ticketId: 'AEOS-1',
    column: 'CODE_REVIEW',
    reason: 'NOT_CONVERGING',
    message: 'stuck',
  });

  it('writes the filled response and returns ok when the staleness matches', () => {
    const filePath = writeEscalationFile(doc);
    const staleness = sha256Hex(doc);

    const result = writeResolution(
      tmpDir,
      'AEOS-1',
      staleness,
      'Use response_url, not chat.update.',
    );

    expect(result).toEqual({ ok: true });
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('Use response_url, not chat.update.');
  });

  it('writes nothing and returns STALE_CONTENT when the file changed on disk', () => {
    const filePath = writeEscalationFile(doc);
    const staleness = sha256Hex(doc);
    const editedOnDisk = doc.replace('stuck', 'stuck again');
    fs.writeFileSync(filePath, editedOnDisk, 'utf-8');

    const result = writeResolution(tmpDir, 'AEOS-1', staleness, 'too late');

    expect(result).toEqual({ ok: false, reason: 'STALE_CONTENT' });
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(editedOnDisk);
  });
});

describe('concurrent read/write race (AC-19)', () => {
  it('refuses a second write using the first read staleness once a write landed in between', () => {
    writeQuestionsFile(QUESTIONS_DOC);

    const firstRead = readQuestions(tmpDir, 'AEOS-1');
    const secondRead = readQuestions(tmpDir, 'AEOS-1');
    expect(firstRead?.staleness).toBe(secondRead?.staleness);

    const firstWrite = writeAnswers(tmpDir, 'AEOS-1', secondRead!.staleness, {
      'Q-001': 'first answer',
    });
    expect(firstWrite).toEqual({ ok: true });

    const secondWrite = writeAnswers(tmpDir, 'AEOS-1', firstRead!.staleness, {
      'Q-001': 'second answer, using stale token',
    });

    expect(secondWrite).toEqual({ ok: false, reason: 'STALE_CONTENT' });
    expect(readQuestions(tmpDir, 'AEOS-1')?.questions[0]?.answer).toBe('first answer');
  });
});
