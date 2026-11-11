// CLI — writes a command's result: text for a person, or with --json exactly
// one envelope of the contract on stdout. Also the only place the process exit
// code is set.

import { CONTRACT_VERSION } from './generated/exit-codes.gen.js';
import type * as T from './generated/types.gen.js';
import type { CommandResult } from './result.js';

export const setProcessExit = (code: number): void => {
  process.exitCode = code;
};

/* eslint-disable no-console */
export function render(
  command: string,
  result: CommandResult<unknown>,
  json: boolean,
  setExit: (code: number) => void = setProcessExit,
): void {
  if (json) {
    const envelope: T.Envelope = {
      ok: result.exit === 0,
      command,
      exit: result.exit,
      contractVersion: CONTRACT_VERSION,
      data: result.data,
      error: result.error,
      warnings: result.warnings,
    };
    console.log(JSON.stringify(envelope));
  } else {
    const text = result.text();
    const write = result.stream === 'stdout' ? console.log : console.error;
    // A line at a time, as the commands used to print.
    if (text) text.split('\n').forEach((line) => write(line));
    for (const warning of result.warnings) console.error(`Warning: ${warning.message}`);
  }
  setExit(result.exit);
}
