// Domain service — parse the agent's verdicts on criteria no instrument answered.
//
// Contract (emitted by the final gate's worker, see .aeos/agents/conformance-agent.yaml):
//
//   <!-- AEOS-CONFORMANCE
//   AC-3: pass | The diff stores the name in the session (src/session.ts).
//   AC-7: fail | Nothing reads the stored name back.
//   -->
//
// As with AEOS-VERDICT, only the block is read, never the prose, and a block
// that is missing, duplicated or malformed is refused: a verdict that was not
// given is never made up.

export interface AgentVerdict {
  readonly id: string;
  readonly result: 'pass' | 'fail';
  readonly justification: string;
}

export type ConformanceVerdictParseResult =
  | { ok: true; verdicts: AgentVerdict[] }
  | { ok: false; reason: string };

const BLOCK_PATTERN = /<!--\s*AEOS-CONFORMANCE\s*([\s\S]*?)-->/g;
const LINE_PATTERN = /^(AC-\d+[a-z]?):\s*(pass|fail)\s*\|\s*(\S.*)$/i;

/**
 * `expected` is the criteria the agent was asked about: when given, the block
 * must judge exactly those.
 */
export function parseConformanceVerdicts(
  content: string,
  expected?: readonly string[],
): ConformanceVerdictParseResult {
  const blocks = [...content.matchAll(BLOCK_PATTERN)];
  if (blocks.length === 0) {
    return {
      ok: false,
      reason:
        'The artifact contains no AEOS-CONFORMANCE block. The agent must emit one — see .aeos/agents/conformance-agent.yaml.',
    };
  }
  if (blocks.length > 1) {
    return {
      ok: false,
      reason:
        'The artifact contains multiple AEOS-CONFORMANCE blocks; cannot determine which is authoritative.',
    };
  }

  const verdicts: AgentVerdict[] = [];
  for (const line of (blocks[0]![1] ?? '').split('\n').map((raw) => raw.trim())) {
    if (line === '') continue;
    const match = LINE_PATTERN.exec(line);
    if (!match) {
      return {
        ok: false,
        reason: `AEOS-CONFORMANCE has a line that is not \`AC-n: pass|fail | justification\`: '${line}'.`,
      };
    }
    const id = match[1]!.replace(/^ac/i, 'AC');
    if (verdicts.some((verdict) => verdict.id === id)) {
      return { ok: false, reason: `AEOS-CONFORMANCE judges ${id} more than once.` };
    }
    verdicts.push({
      id,
      result: match[2]!.toLowerCase() as 'pass' | 'fail',
      justification: match[3]!.trim(),
    });
  }

  if (expected) {
    const judged = verdicts.map((verdict) => verdict.id);
    const missing = expected.filter((id) => !judged.includes(id));
    const extra = judged.filter((id) => !expected.includes(id));
    if (missing.length > 0 || extra.length > 0) {
      return {
        ok: false,
        reason: `AEOS-CONFORMANCE must judge exactly ${expected.join(', ')}.${missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : ''}${extra.length > 0 ? ` Not asked about: ${extra.join(', ')}.` : ''}`,
      };
    }
  }
  return { ok: true, verdicts };
}
