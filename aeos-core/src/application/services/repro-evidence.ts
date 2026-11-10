// Application service — the evidence of a bug's reproduction: what the engine
// keeps between the two phases, and what it shows a person afterwards.

/** One run of the reproducing command. `exitCode` is null when it was killed. */
export interface ReproRun {
  readonly exitCode: number | null;
  readonly outputTail: string;
}

/**
 * Kept as `<ticket>-repro.json` once the test has been seen to fail, so a
 * later attempt or run goes straight to the fix.
 */
export interface ReproState {
  readonly command: string;
  readonly red: ReproRun;
  /** SHA-256 of every file the reproduce phase added or changed, by path from the project root. */
  readonly files: Readonly<Record<string, string | null>>;
}

/** What the fix phase is told: the command, and the files it must leave alone. */
export function reproductionBrief(state: ReproState): string {
  return [
    '# Reproduction',
    '',
    `The reproducing test is committed and fails. AEOS runs it with: \`${state.command}\``,
    '',
    'Do not edit these files; they are compared with what was committed:',
    '',
    ...Object.keys(state.files).map((file) => `- ${file}`),
    '',
    'Its output before the fix:',
    '',
    '```',
    state.red.outputTail,
    '```',
  ].join('\n');
}

/** `<ticket>-repro.md`: the command, both exit codes and both output tails. */
export function renderReproEvidence(state: ReproState, green: ReproRun): string {
  return [
    '# Reproduction',
    '',
    `Command: \`${state.command}\``,
    '',
    '| Run | Exit code |',
    '| --- | --- |',
    `| Before the fix | ${state.red.exitCode ?? 'killed'} |`,
    `| After the fix | ${green.exitCode ?? 'killed'} |`,
    '',
    '## Before the fix',
    '',
    '```',
    state.red.outputTail,
    '```',
    '',
    '## After the fix',
    '',
    '```',
    green.outputTail,
    '```',
  ].join('\n');
}
