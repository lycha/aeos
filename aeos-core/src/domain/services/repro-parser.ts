// Domain service — parse the block that names the command running a bug's
// reproducing test.
//
// Contract (emitted by the worker in the reproduce phase of the bug track, see
// `bugTrack.reproduce` in .aeos/agents/engineer-agent.yaml):
//
//   <!-- AEOS-REPRO
//   command: npx vitest run src/foo.test.ts -t "returns 404 for a missing ticket"
//   -->
//
// Exactly one block, or the caller escalates: the engine runs this command
// twice as the proof, so it is never guessed from the prose.

export type ReproParseResult = { ok: true; command: string } | { ok: false; reason: string };

const BLOCK_PATTERN = /<!--\s*AEOS-REPRO\s*([\s\S]*?)-->/g;

export function parseRepro(content: string): ReproParseResult {
  const blocks = [...content.matchAll(BLOCK_PATTERN)];
  if (blocks.length === 0) {
    return {
      ok: false,
      reason:
        'The notes contain no AEOS-REPRO block naming the command that runs the reproducing test. The worker must emit one — see `bugTrack.reproduce` in .aeos/agents/engineer-agent.yaml.',
    };
  }
  if (blocks.length > 1) {
    return {
      ok: false,
      reason: 'The notes contain multiple AEOS-REPRO blocks; cannot determine which to run.',
    };
  }
  // Everything after the first colon: a command has colons of its own.
  const command = /^\s*command:[ \t]*(\S.*)$/m.exec(blocks[0]![1] ?? '')?.[1]?.trim();
  if (!command) {
    return { ok: false, reason: 'The AEOS-REPRO block is missing the `command` field.' };
  }
  return { ok: true, command };
}
