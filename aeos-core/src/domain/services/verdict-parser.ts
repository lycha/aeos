// Domain service — parse the machine-readable verdict trailer from a review artifact.
//
// Contract (emitted by reviewer agents, see .aeos/agents/reviewer-agent.yaml):
//
//   <!-- AEOS-VERDICT
//   verdict: REJECTED
//   blockers: 2
//   warnings: 3
//   info: 1
//   blocker-topics: missing-error-handling, undefined-rollback-path
//   -->
//
// The prose review above the trailer is for humans. Loop control reads ONLY
// the trailer — never the prose. A missing or malformed trailer is a hard
// failure, deliberately: silently treating it as APPROVED would ship
// unreviewed work, and treating it as REJECTED would spin the retry loop.

import { Verdict, isValidVerdict, type ReviewVerdict } from '../model/review-verdict.js';

export type VerdictParseResult =
  | { ok: true; verdict: ReviewVerdict }
  | { ok: false; reason: string };

const TRAILER_PATTERN = /<!--\s*AEOS-VERDICT\s*([\s\S]*?)-->/;

function parseFields(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of body.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (key.length > 0) {
      fields.set(key, value);
    }
  }
  return fields;
}

function parseCount(fields: Map<string, string>, key: string): number {
  const raw = fields.get(key);
  if (raw === undefined) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseTopics(fields: Map<string, string>): string[] {
  const raw = fields.get('blocker-topics');
  if (!raw) return [];
  return raw
    .split(',')
    .map((topic) => topic.trim().toLowerCase())
    .filter((topic) => topic.length > 0);
}

/**
 * Extracts the verdict trailer from a review artifact.
 *
 * Returns `ok: false` when the trailer is absent, duplicated, or carries an
 * unrecognised verdict — all of which the caller must surface as a run failure
 * rather than coercing into a pass or a rejection.
 */
export function parseVerdict(reviewContent: string): VerdictParseResult {
  const match = TRAILER_PATTERN.exec(reviewContent);
  if (!match) {
    return {
      ok: false,
      reason:
        'Review artifact contains no AEOS-VERDICT trailer. The reviewer agent must emit one — see .aeos/agents/reviewer-agent.yaml.',
    };
  }

  // A second trailer means the model emitted its template scaffold alongside a
  // real verdict. Which one is authoritative is ambiguous, so refuse to guess.
  const remainder = reviewContent.slice(match.index + match[0].length);
  if (TRAILER_PATTERN.test(remainder)) {
    return {
      ok: false,
      reason:
        'Review artifact contains multiple AEOS-VERDICT trailers; cannot determine which is authoritative.',
    };
  }

  const fields = parseFields(match[1] ?? '');
  const rawVerdict = (fields.get('verdict') ?? '').toUpperCase();

  if (!rawVerdict) {
    return { ok: false, reason: 'AEOS-VERDICT trailer is missing the `verdict` field.' };
  }
  if (!isValidVerdict(rawVerdict)) {
    return {
      ok: false,
      reason: `AEOS-VERDICT trailer carries an unrecognised verdict: '${rawVerdict}'. Expected APPROVED, APPROVED_WITH_WARNINGS, or REJECTED.`,
    };
  }

  const blockerTopics = parseTopics(fields);
  const declaredBlockers = parseCount(fields, 'blockers');

  // Trust the topic list over the declared count when they disagree — topics
  // drive convergence detection, so an undercount there is the costlier error.
  const blockers = Math.max(declaredBlockers, blockerTopics.length);

  if (rawVerdict === Verdict.REJECTED && blockers === 0) {
    return {
      ok: false,
      reason:
        'AEOS-VERDICT declares REJECTED but reports zero blockers. A rejection must cite at least one BLOCKER.',
    };
  }

  return {
    ok: true,
    verdict: {
      verdict: rawVerdict,
      blockers,
      warnings: parseCount(fields, 'warnings'),
      info: parseCount(fields, 'info'),
      blockerTopics,
    },
  };
}
