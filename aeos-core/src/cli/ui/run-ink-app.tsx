import { render } from 'ink';
import type { Command } from 'commander';

import type { Container } from '../container.js';
import { AppShell } from './App.js';

interface RunInkAppOptions {
  readonly container: Container;
  readonly buildProgram: () => Command;
  readonly cwd?: string;
  readonly stdout?: NodeJS.WriteStream;
  readonly stdin?: NodeJS.ReadStream;
  readonly stderr?: NodeJS.WriteStream;
}

export async function runInkApp({
  container,
  buildProgram,
  cwd = process.cwd(),
  stdout = process.stdout,
  stdin = process.stdin,
  stderr = process.stderr,
}: RunInkAppOptions): Promise<void> {
  const instance = render(
    <AppShell container={container} cwd={cwd} buildProgram={buildProgram} />,
    {
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      patchConsole: false,
      alternateScreen: true,
    },
  );

  await instance.waitUntilExit();
}
