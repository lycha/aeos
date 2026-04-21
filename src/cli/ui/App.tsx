import { useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type { Command } from 'commander';

import type { Container } from '../container.js';
import type { TicketRunPort, TicketRunResult } from '../../domain/ports/driving/ticket-run.port.js';
import {
  createInitialTicketRunShellState,
  applyTicketRunEvent,
  renderTicketRunContent,
  requestTicketRunInterrupt,
  type TicketRunShellState,
} from './ticket-run-shell-state.js';
import { executeShellCommand } from './shell-command-runner.js';

type ViewMode = 'home' | 'output' | 'ticket-run';

interface AppShellProps {
  readonly container: Container;
  readonly cwd: string;
  readonly buildProgram: () => Command;
}

interface ProjectContext {
  readonly root: string | null;
  readonly name: string | null;
  readonly key: string | null;
  readonly id: string | null;
}

const MAX_SHELL_LINES = 200;

export function AppShell({ container, cwd, buildProgram }: AppShellProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [projectContext, setProjectContext] = useState<ProjectContext>(() =>
    resolveProjectContext(container, cwd),
  );
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [shellLines, setShellLines] = useState<string[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [cursorIndex, setCursorIndex] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [statusLine, setStatusLine] = useState('Ready. Type a command below.');
  const [running, setRunning] = useState(false);
  const [ticketRunState, setTicketRunState] = useState<TicketRunShellState | null>(null);
  const activeRunRef = useRef<TicketRunPort | null>(null);
  const commandInputRef = useRef('');
  const cursorIndexRef = useRef(0);

  const columns = stdout.columns ?? 80;
  const rows = stdout.rows ?? 24;
  const headerRows = 3;
  const footerRows = 3;
  const contentRows = Math.max(rows - headerRows - footerRows, 8);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (running && activeRunRef.current) {
        setStatusLine('Interrupt requested. Waiting for the active ticket run to stop...');
        setTicketRunState((current) => (current ? requestTicketRunInterrupt(current) : current));
        void activeRunRef.current.interrupt().catch(() => undefined);
        return;
      }

      exit();
      return;
    }

    if (running) {
      return;
    }

    if (key.return) {
      void submitCommand();
      return;
    }

    if (key.escape) {
      updateCommandInput('', 0);
      setHistoryIndex(null);
      return;
    }

    if (key.upArrow) {
      navigateHistory('up');
      return;
    }

    if (key.downArrow) {
      navigateHistory('down');
      return;
    }

    if (key.leftArrow) {
      updateCommandInput(commandInputRef.current, Math.max(cursorIndexRef.current - 1, 0));
      return;
    }

    if (key.rightArrow) {
      updateCommandInput(
        commandInputRef.current,
        Math.min(cursorIndexRef.current + 1, commandInputRef.current.length),
      );
      return;
    }

    if (key.backspace) {
      if (cursorIndexRef.current === 0) {
        return;
      }

      const nextValue =
        commandInputRef.current.slice(0, cursorIndexRef.current - 1) +
        commandInputRef.current.slice(cursorIndexRef.current);
      updateCommandInput(nextValue, Math.max(cursorIndexRef.current - 1, 0));
      setHistoryIndex(null);
      return;
    }

    if (key.delete) {
      const nextValue =
        commandInputRef.current.slice(0, cursorIndexRef.current) +
        commandInputRef.current.slice(cursorIndexRef.current + 1);
      updateCommandInput(nextValue, cursorIndexRef.current);
      setHistoryIndex(null);
      return;
    }

    if (key.tab) {
      insertText('  ');
      return;
    }

    if (input.length > 0 && !key.ctrl && !key.meta) {
      insertText(input);
    }
  });

  const contentLines =
    viewMode === 'ticket-run' && ticketRunState
      ? renderTicketRunContent(ticketRunState, columns, contentRows)
      : renderContentLines(viewMode, shellLines, projectContext, columns, contentRows);

  return (
    <Box flexDirection="column" height={rows}>
      {renderTextLines([
        truncateLine('AEOS Ink shell', columns),
        truncateLine(buildHeaderLine(projectContext, viewMode, statusLine), columns),
        '-'.repeat(columns),
      ])}

      <Box flexDirection="column" flexGrow={1}>
        {renderTextLines(contentLines)}
      </Box>

      {renderTextLines([
        '-'.repeat(columns),
        truncateLine(`> ${renderCommandInput(commandInput, cursorIndex)}`, columns),
        truncateLine(
          running
            ? 'Active run in progress · Ctrl+C interrupts the current ticket run.'
            : 'Enter command · Up/Down history · Esc clears input · Ctrl+C quits.',
          columns,
        ),
      ])}
    </Box>
  );

  function insertText(text: string): void {
    const nextValue =
      commandInputRef.current.slice(0, cursorIndexRef.current) +
      text +
      commandInputRef.current.slice(cursorIndexRef.current);
    updateCommandInput(nextValue, cursorIndexRef.current + text.length);
    setHistoryIndex(null);
  }

  function updateCommandInput(nextValue: string, nextCursor: number): void {
    commandInputRef.current = nextValue;
    cursorIndexRef.current = nextCursor;
    setCommandInput(nextValue);
    setCursorIndex(nextCursor);
  }

  function navigateHistory(direction: 'up' | 'down'): void {
    if (history.length === 0) {
      return;
    }

    if (direction === 'up') {
      const nextIndex = historyIndex === null ? history.length - 1 : Math.max(historyIndex - 1, 0);
      const nextCommand = history[nextIndex] ?? '';
      setHistoryIndex(nextIndex);
      updateCommandInput(nextCommand, nextCommand.length);
      return;
    }

    if (historyIndex === null) {
      return;
    }

    const nextIndex = historyIndex + 1;
    if (nextIndex >= history.length) {
      setHistoryIndex(null);
      updateCommandInput('', 0);
      return;
    }

    const nextCommand = history[nextIndex] ?? '';
    setHistoryIndex(nextIndex);
    updateCommandInput(nextCommand, nextCommand.length);
  }

  async function submitCommand(): Promise<void> {
    const command = commandInputRef.current.trim();
    updateCommandInput('', 0);
    setHistoryIndex(null);

    if (command.length === 0) {
      return;
    }

    setHistory((current) => [...current, command]);
    appendShellLines([`$ ${command}`]);

    const result = await executeShellCommand(command, buildProgram);
    if (result.kind === 'noop') {
      return;
    }

    if (result.kind === 'clear') {
      setShellLines([]);
      setViewMode('home');
      setTicketRunState(null);
      setStatusLine('Shell output cleared.');
      refreshProjectContext();
      return;
    }

    if (result.kind === 'exit') {
      exit();
      return;
    }

    if (result.kind === 'lines') {
      appendShellLines(result.lines);
      setViewMode(result.lines.length > 0 ? 'output' : 'home');
      setStatusLine(
        result.exitCode === 0
          ? 'Command completed.'
          : `Command failed with exit code ${result.exitCode}.`,
      );
      refreshProjectContext();
      return;
    }

    await runTicketCommand(result.commandLine, result.ticketId, result.executorOverrides);
  }

  async function runTicketCommand(
    commandLine: string,
    ticketId: string,
    executorOverrides: Parameters<TicketRunPort['execute']>[3],
  ): Promise<void> {
    const nextProjectContext = resolveProjectContext(container, cwd);
    setProjectContext(nextProjectContext);

    if (!nextProjectContext.root || !nextProjectContext.id) {
      appendShellLines(['Error: No AEOS project found. Run "aeos project init" first.']);
      setViewMode('output');
      setStatusLine('Ticket run could not start.');
      return;
    }

    const useCase = container.ticketRun;
    activeRunRef.current = useCase;
    setRunning(true);
    setViewMode('ticket-run');
    setStatusLine(`Running ticket ${ticketId}...`);
    setTicketRunState(createInitialTicketRunShellState(commandLine));

    try {
      const result = await useCase.execute(
        nextProjectContext.id,
        nextProjectContext.root,
        ticketId,
        executorOverrides,
        {
          onEvent: (event) => {
            setTicketRunState((current) =>
              applyTicketRunEvent(current ?? createInitialTicketRunShellState(commandLine), event),
            );
          },
        },
      );

      appendShellLines(summarizeTicketRunResult(result));
      setStatusLine(getTicketRunStatusLine(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendShellLines([`Error: ${message}`]);
      setStatusLine('Ticket run failed with an unexpected error.');
      setViewMode('output');
    } finally {
      activeRunRef.current = null;
      setRunning(false);
      refreshProjectContext();
    }
  }

  function appendShellLines(lines: string[]): void {
    setShellLines((current) => {
      const next = [...current, ...lines];
      return next.length > MAX_SHELL_LINES ? next.slice(-MAX_SHELL_LINES) : next;
    });
  }

  function refreshProjectContext(): void {
    setProjectContext(resolveProjectContext(container, cwd));
  }
}

function renderContentLines(
  viewMode: ViewMode,
  shellLines: string[],
  projectContext: ProjectContext,
  columns: number,
  rows: number,
): string[] {
  if (viewMode === 'output' && shellLines.length > 0) {
    return fitToRows(wrapLines(shellLines, columns), rows);
  }

  const lines = [
    'Welcome to the AEOS persistent shell.',
    '',
    projectContext.root
      ? `Project: ${projectContext.name ?? 'Unknown'} (${projectContext.key ?? '—'})`
      : 'Project: not inside an AEOS workspace.',
    '',
    'Try one of these commands:',
    '  ticket list',
    '  ticket show AEOS-1',
    '  ticket run AEOS-1',
    '  help',
    '  clear',
  ];

  return fitToRows(
    lines.map((line) => truncateLine(line, columns)),
    rows,
  );
}

function buildHeaderLine(project: ProjectContext, viewMode: ViewMode, statusLine: string): string {
  const projectLabel = project.root
    ? `Project: ${project.name ?? 'Unknown'} (${project.key ?? '—'})`
    : 'Project: none';
  return `${projectLabel} | View: ${viewMode} | ${statusLine}`;
}

function renderCommandInput(commandInput: string, cursorIndex: number): string {
  const before = commandInput.slice(0, cursorIndex);
  const after = commandInput.slice(cursorIndex);
  return `${before}|${after}`;
}

function renderTextLines(lines: string[]) {
  return lines.map((line, index) => <Text key={`${index}:${line}`}>{line}</Text>);
}

function resolveProjectContext(container: Container, cwd: string): ProjectContext {
  try {
    const root = container.projectRepo.findRoot(cwd);
    if (!root) {
      return { root: null, name: null, key: null, id: null };
    }

    const project = container.projectRepo.read(root);
    return {
      root,
      name: project.name,
      key: project.key,
      id: project.id,
    };
  } catch {
    return { root: null, name: null, key: null, id: null };
  }
}

function summarizeTicketRunResult(result: TicketRunResult): string[] {
  switch (result.status) {
    case 'success':
      return [
        `✓ Ticket ${result.ticketId} reached SIGNED_OFF`,
        `  Artifact: ${result.artifactPath}`,
        `  Review:   ${result.reviewPath}`,
      ];
    case 'blocked':
      return [
        `⚠ Ticket ${result.ticketId} is blocked:`,
        ...result.blockers.map((blocker) => `  - ${blocker}`),
      ];
    case 'failed':
      return [`✗ Ticket ${result.ticketId} failed: ${result.error}`];
  }
}

function getTicketRunStatusLine(result: TicketRunResult): string {
  switch (result.status) {
    case 'success':
      return `Ticket ${result.ticketId} completed successfully.`;
    case 'blocked':
      return `Ticket ${result.ticketId} is blocked.`;
    case 'failed':
      return `Ticket ${result.ticketId} failed.`;
  }
}

function wrapLines(lines: string[], width: number): string[] {
  const wrapped: string[] = [];
  for (const line of lines) {
    if (line.length === 0) {
      wrapped.push('');
      continue;
    }

    for (let index = 0; index < line.length; index += Math.max(width, 1)) {
      wrapped.push(line.slice(index, index + Math.max(width, 1)));
    }
  }
  return wrapped;
}

function fitToRows(lines: string[], rows: number): string[] {
  const visible = lines.slice(-rows);
  while (visible.length < rows) {
    visible.unshift('');
  }
  return visible;
}

function truncateLine(line: string, width: number): string {
  if (width <= 0) {
    return '';
  }

  if (line.length <= width) {
    return line;
  }

  if (width <= 3) {
    return line.slice(0, width);
  }

  return `${line.slice(0, width - 3)}...`;
}
