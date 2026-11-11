// CLI — the one way a command asks a person something. The question goes to
// stderr, so stdout stays a single envelope under --json.

import * as readline from 'node:readline';

export interface Prompt {
  /** False when stdin is not a terminal: no command asks then. */
  readonly interactive: boolean;
  /** Asks one question and returns the trimmed answer. */
  ask(question: string): Promise<string>;
}

export const terminalPrompt: Prompt = {
  get interactive(): boolean {
    return process.stdin.isTTY === true;
  },
  ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  },
};
