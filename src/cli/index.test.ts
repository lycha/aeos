import { describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

import { runCli, shouldLaunchInkShell } from './index.js';
import type { Container } from './container.js';

describe('CLI entrypoint runtime', () => {
  it('launches the Ink shell for bare interactive aeos', async () => {
    const runInkAppMock = vi.fn().mockResolvedValue(undefined);
    const parseAsync = vi.fn().mockResolvedValue(undefined);
    const buildProgramMock = vi.fn(() => ({ parseAsync }) as unknown as Command);
    const createContainerMock = vi.fn(() => ({}) as Container);

    await runCli(['node', 'aeos'], {
      stdout: { isTTY: true },
      runInkApp: runInkAppMock,
      buildProgram: buildProgramMock,
      createContainer: createContainerMock,
    });

    expect(runInkAppMock).toHaveBeenCalledOnce();
    expect(parseAsync).not.toHaveBeenCalled();
  });

  it('keeps explicit subcommands on the Commander path', async () => {
    const parseAsync = vi.fn().mockResolvedValue(undefined);

    await runCli(['node', 'aeos', 'ticket', 'list'], {
      stdout: { isTTY: true },
      runInkApp: vi.fn(),
      buildProgram: () => ({ parseAsync }) as unknown as Command,
      createContainer: vi.fn(() => ({}) as Container),
    });

    expect(parseAsync).toHaveBeenCalledWith(['node', 'aeos', 'ticket', 'list']);
  });

  it('does not launch Ink when stdout is not a TTY', async () => {
    const parseAsync = vi.fn().mockResolvedValue(undefined);
    const runInkAppMock = vi.fn();

    await runCli(['node', 'aeos'], {
      stdout: { isTTY: false },
      runInkApp: runInkAppMock,
      buildProgram: () => ({ parseAsync }) as unknown as Command,
      createContainer: vi.fn(() => ({}) as Container),
    });

    expect(runInkAppMock).not.toHaveBeenCalled();
    expect(parseAsync).toHaveBeenCalledWith(['node', 'aeos']);
  });
});

describe('shouldLaunchInkShell', () => {
  it('returns true for interactive bare aeos', () => {
    expect(shouldLaunchInkShell([], { isTTY: true })).toBe(true);
  });

  it('returns false when arguments are present', () => {
    expect(shouldLaunchInkShell(['ticket', 'run'], { isTTY: true })).toBe(false);
  });
});
