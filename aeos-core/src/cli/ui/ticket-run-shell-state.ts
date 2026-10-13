import type { TicketRunEvent, TicketRunPhase } from '../../domain/model/ticket-run-event.js';

const FULL_LAYOUT_COLUMNS = 120;
const MAX_RAW_LINES = 400;

const PHASE_ORDER: TicketRunPhase[] = [
  'eligibility',
  'context',
  'preflight',
  'state',
  'worker',
  'validation',
  'artifact',
  'rubrics',
  'review-context',
  'reviewer',
  'sign-off',
  'complete',
];

const PHASE_LABELS: Record<TicketRunPhase, string> = {
  eligibility: 'Eligibility',
  context: 'Context',
  preflight: 'Preflight',
  state: 'State',
  worker: 'Worker',
  validation: 'Validation',
  artifact: 'Artifact',
  rubrics: 'Rubrics',
  'review-context': 'Review context',
  reviewer: 'Reviewer',
  'sign-off': 'Sign-off',
  complete: 'Complete',
};

type DisplayStageStatus = 'pending' | 'active' | 'completed' | 'failed';
type ChunkSource = 'preflight' | 'worker' | 'reviewer';
type ChunkStream = 'stdout' | 'stderr';

interface StageSnapshot {
  status: DisplayStageStatus;
  message?: string;
}

export interface TicketRunShellState {
  readonly commandLine: string;
  readonly ticketId: string;
  readonly column: string;
  readonly executor: string;
  readonly model: string;
  readonly mode: string;
  readonly subState: string | null;
  readonly activeStage: TicketRunPhase | null;
  /**
   * Union rather than `string` on purpose: as a bare string, adding a terminal
   * outcome compiled fine and left the TUI reporting `running` after the run
   * had ended.
   */
  readonly finalStatus:
    | 'running'
    | 'completed'
    | 'blocked'
    | 'failed'
    | 'interrupted'
    | 'escalated';
  readonly interruptRequested: boolean;
  readonly truncatedLines: number;
  readonly rawLines: string[];
  readonly stageStates: Record<TicketRunPhase, StageSnapshot>;
  readonly partialBuffers: Record<string, string>;
}

export function createInitialTicketRunShellState(commandLine: string): TicketRunShellState {
  return {
    commandLine,
    ticketId: '—',
    column: '—',
    executor: '—',
    model: '—',
    mode: '—',
    subState: null,
    activeStage: null,
    finalStatus: 'running',
    interruptRequested: false,
    truncatedLines: 0,
    rawLines: [],
    stageStates: createInitialStageStates(),
    partialBuffers: {},
  };
}

export function requestTicketRunInterrupt(state: TicketRunShellState): TicketRunShellState {
  return { ...state, interruptRequested: true };
}

export function applyTicketRunEvent(
  state: TicketRunShellState,
  event: TicketRunEvent,
): TicketRunShellState {
  let next: TicketRunShellState = {
    ...state,
    ticketId: event.ticketId,
    column: event.column,
    rawLines: [...state.rawLines],
    stageStates: { ...state.stageStates },
    partialBuffers: { ...state.partialBuffers },
  };

  const appendLogLine = (line: string): void => {
    if (next.rawLines.length >= MAX_RAW_LINES) {
      next = {
        ...next,
        rawLines: [...next.rawLines.slice(1), line],
        truncatedLines: next.truncatedLines + 1,
      };
      return;
    }

    next = { ...next, rawLines: [...next.rawLines, line] };
  };

  switch (event.type) {
    case 'ticket-run.started':
      next = {
        ...next,
        executor: event.payload.executor,
        model: event.payload.model ?? '—',
      };
      appendLogLine(
        `[run] started | executor=${event.payload.executor}${event.payload.model ? ` | model=${event.payload.model}` : ''}`,
      );
      break;
    case 'stage.started':
      next = {
        ...next,
        activeStage: event.payload.stage,
        executor: event.payload.executor ?? next.executor,
        model: event.payload.model ?? next.model,
        mode: event.payload.mode ?? next.mode,
        stageStates: {
          ...next.stageStates,
          [event.payload.stage]: {
            status: 'active',
            message: event.payload.message,
          },
        },
      };
      appendLogLine(`[stage:${event.payload.stage}] started | ${event.payload.message}`);
      break;
    case 'stage.completed':
      next = {
        ...next,
        activeStage: next.activeStage === event.payload.stage ? null : next.activeStage,
        stageStates: {
          ...next.stageStates,
          [event.payload.stage]: {
            status: 'completed',
            message: event.payload.message,
          },
        },
      };
      next = flushStageBuffers(next, event.payload.stage, appendLogLine);
      appendLogLine(`[stage:${event.payload.stage}] completed | ${event.payload.message}`);
      break;
    case 'stage.failed':
      next = {
        ...next,
        activeStage: next.activeStage === event.payload.stage ? null : next.activeStage,
        stageStates: {
          ...next.stageStates,
          [event.payload.stage]: {
            status: 'failed',
            message: event.payload.message,
          },
        },
      };
      next = flushStageBuffers(next, event.payload.stage, appendLogLine);
      appendLogLine(`[stage:${event.payload.stage}] failed | ${event.payload.message}`);
      break;
    case 'sub-state.changed':
      next = { ...next, subState: event.payload.to };
      appendLogLine(`[state] ${event.payload.from ?? '—'} -> ${event.payload.to ?? '—'}`);
      break;
    case 'artifact.written':
      appendLogLine(`[artifact] ${event.payload.role} wrote ${event.payload.path}`);
      break;
    case 'artifact.committed':
      appendLogLine(`[git] ${event.payload.role} committed ${event.payload.path}`);
      break;
    case 'review.rejected':
      appendLogLine(`[review] rejected | ${event.payload.reason}`);
      break;
    case 'cost.recorded':
      appendLogLine(
        `[cost] ${event.payload.role} | in=${event.payload.inputTokens} out=${event.payload.outputTokens} usd=${event.payload.costUsd.toFixed(4)}`,
      );
      break;
    case 'executor.stdout.chunk':
      next = consumeChunk(next, event.payload.source, 'stdout', event.payload.chunk, appendLogLine);
      break;
    case 'executor.stderr.chunk':
      next = consumeChunk(next, event.payload.source, 'stderr', event.payload.chunk, appendLogLine);
      break;
    case 'ticket-run.completed':
      next = { ...flushAllBuffers(next, appendLogLine), finalStatus: 'completed' };
      appendLogLine('[run] completed');
      break;
    case 'ticket-run.blocked':
      next = { ...flushAllBuffers(next, appendLogLine), finalStatus: 'blocked' };
      appendLogLine(`[run] blocked | ${event.payload.blockers.join('; ')}`);
      break;
    case 'ticket-run.failed':
      next = { ...flushAllBuffers(next, appendLogLine), finalStatus: 'failed' };
      appendLogLine(`[run] failed | ${event.payload.message}`);
      break;
    case 'ticket-run.interrupted':
      next = { ...flushAllBuffers(next, appendLogLine), finalStatus: 'interrupted' };
      appendLogLine(
        `[run] interrupted${event.payload.stage ? ` at ${event.payload.stage}` : ''} | ${event.payload.message}`,
      );
      break;
    case 'ticket-run.escalated':
      next = { ...flushAllBuffers(next, appendLogLine), finalStatus: 'escalated' };
      appendLogLine(`[run] escalated | ${event.payload.reason} | ${event.payload.message}`);
      break;
    case 'run.attempt.started':
      // Only worth a line on a retry; the first attempt is implied by the run.
      if (event.payload.attempt > 1) {
        appendLogLine(
          `[run] revision attempt ${event.payload.attempt} of ${event.payload.maxAttempts}`,
        );
      }
      break;
  }

  return next;
}

export function renderTicketRunContent(
  state: TicketRunShellState,
  columns: number,
  rows: number,
): string[] {
  const safeColumns = Math.max(columns, 40);
  const safeRows = Math.max(rows, 8);
  const header = [
    truncateLine(`AEOS ticket run | ${state.ticketId} | ${state.column}`, safeColumns),
    truncateLine(buildMetaLine(state), safeColumns),
  ];
  const footer = [truncateLine(buildFooterLine(state, safeColumns), safeColumns)];
  const bodyRows = Math.max(safeRows - header.length - footer.length, 4);
  const body =
    safeColumns >= FULL_LAYOUT_COLUMNS
      ? renderSplitBody(state, safeColumns, bodyRows)
      : renderStackedBody(state, safeColumns, bodyRows);

  const lines = [...header, ...body, ...footer];
  const visible = [...lines.slice(0, safeRows)];
  while (visible.length < safeRows) {
    visible.push('');
  }
  return visible;
}

function buildMetaLine(state: TicketRunShellState): string {
  return [
    `Stage: ${state.activeStage ? PHASE_LABELS[state.activeStage] : state.finalStatus}`,
    `Executor: ${state.executor}`,
    `Model: ${state.model}`,
    `Mode: ${state.mode}`,
  ].join(' | ');
}

function buildFooterLine(state: TicketRunShellState, columns: number): string {
  const layout = columns >= FULL_LAYOUT_COLUMNS ? 'split' : 'stacked';
  const interrupt = state.interruptRequested ? ' | Interrupt requested...' : '';
  return `Layout: ${layout} | Result: ${state.finalStatus} | Sub-state: ${state.subState ?? '—'}${interrupt}`;
}

function renderSplitBody(state: TicketRunShellState, columns: number, rows: number): string[] {
  const leftWidth = Math.min(48, Math.max(32, Math.floor(columns * 0.34)));
  const rightWidth = Math.max(columns - leftWidth - 3, 24);
  const leftLines = renderSummaryPane(state, leftWidth, rows);
  const rightLines = renderLogPane(state, rightWidth, rows);
  const rendered: string[] = [];

  for (let index = 0; index < rows; index += 1) {
    rendered.push(
      `${padLine(leftLines[index] ?? '', leftWidth)} | ${padLine(rightLines[index] ?? '', rightWidth)}`,
    );
  }

  return rendered;
}

function renderStackedBody(state: TicketRunShellState, columns: number, rows: number): string[] {
  const summaryRows = Math.min(Math.max(Math.floor(rows * 0.45), 7), rows - 4);
  const logRows = Math.max(rows - summaryRows - 1, 3);
  return [
    ...renderSummaryPane(state, columns, summaryRows),
    '-'.repeat(columns),
    ...renderLogPane(state, columns, logRows),
  ];
}

function renderSummaryPane(state: TicketRunShellState, width: number, rows: number): string[] {
  const metadata = [
    'Stages',
    `Current: ${state.activeStage ? PHASE_LABELS[state.activeStage] : state.finalStatus}`,
    `Executor: ${state.executor}`,
    `Model: ${state.model}`,
    `Mode: ${state.mode}`,
    `Sub-state: ${state.subState ?? '—'}`,
    '',
  ];
  const stageLines = PHASE_ORDER.map((phase) => formatStageLine(state, phase, width));
  return fitLinesAroundFocus(
    [...metadata, ...stageLines],
    rows,
    metadata.length + Math.max(PHASE_ORDER.indexOf(state.activeStage ?? 'complete'), 0),
  ).map((line) => truncateLine(line, width));
}

function renderLogPane(state: TicketRunShellState, width: number, rows: number): string[] {
  const wrapped: string[] = ['Raw output'];
  if (state.truncatedLines > 0) {
    wrapped.push(`... ${state.truncatedLines} older lines truncated ...`);
  }

  for (const line of state.rawLines) {
    wrapped.push(...wrapLine(line, width));
  }

  const visible = wrapped.slice(-rows);
  while (visible.length < rows) {
    visible.unshift('');
  }

  return visible.map((line) => truncateLine(line, width));
}

function formatStageLine(state: TicketRunShellState, phase: TicketRunPhase, width: number): string {
  const snapshot = state.stageStates[phase] ?? { status: 'pending' };
  const marker =
    snapshot.status === 'active'
      ? '[>]'
      : snapshot.status === 'completed'
        ? '[x]'
        : snapshot.status === 'failed'
          ? '[!]'
          : '[ ]';
  return truncateLine(
    `${marker} ${PHASE_LABELS[phase]}${snapshot.message ? ` ${snapshot.message}` : ''}`,
    width,
  );
}

function createInitialStageStates(): Record<TicketRunPhase, StageSnapshot> {
  return {
    eligibility: { status: 'pending' },
    context: { status: 'pending' },
    preflight: { status: 'pending' },
    state: { status: 'pending' },
    worker: { status: 'pending' },
    validation: { status: 'pending' },
    artifact: { status: 'pending' },
    rubrics: { status: 'pending' },
    'review-context': { status: 'pending' },
    reviewer: { status: 'pending' },
    'sign-off': { status: 'pending' },
    complete: { status: 'pending' },
  };
}

function consumeChunk(
  state: TicketRunShellState,
  source: ChunkSource,
  stream: ChunkStream,
  chunk: string,
  appendLogLine: (line: string) => void,
): TicketRunShellState {
  const key = `${source}:${stream}`;
  const prefix = `[${source}/${stream}]`;
  const normalized = chunk.replace(/\r/g, '\n');
  const combined = `${state.partialBuffers[key] ?? ''}${normalized}`;
  const parts = combined.split('\n');
  const remainder = parts.pop() ?? '';
  const next = { ...state, partialBuffers: { ...state.partialBuffers, [key]: remainder } };

  for (const part of parts) {
    appendLogLine(part.length === 0 ? prefix : `${prefix} ${part}`);
  }

  return next;
}

function flushStageBuffers(
  state: TicketRunShellState,
  stage: TicketRunPhase,
  appendLogLine: (line: string) => void,
): TicketRunShellState {
  if (stage === 'preflight' || stage === 'worker' || stage === 'reviewer') {
    return flushSourceBuffers(state, stage, appendLogLine);
  }
  return state;
}

function flushAllBuffers(
  state: TicketRunShellState,
  appendLogLine: (line: string) => void,
): TicketRunShellState {
  let next = state;
  next = flushSourceBuffers(next, 'preflight', appendLogLine);
  next = flushSourceBuffers(next, 'worker', appendLogLine);
  next = flushSourceBuffers(next, 'reviewer', appendLogLine);
  return next;
}

function flushSourceBuffers(
  state: TicketRunShellState,
  source: ChunkSource,
  appendLogLine: (line: string) => void,
): TicketRunShellState {
  let next = state;
  next = flushPartialBuffer(next, `${source}:stdout`, `[${source}/stdout]`, appendLogLine);
  next = flushPartialBuffer(next, `${source}:stderr`, `[${source}/stderr]`, appendLogLine);
  return next;
}

function flushPartialBuffer(
  state: TicketRunShellState,
  key: string,
  prefix: string,
  appendLogLine: (line: string) => void,
): TicketRunShellState {
  const remainder = state.partialBuffers[key];
  const partialBuffers = { ...state.partialBuffers };
  delete partialBuffers[key];

  if (remainder && remainder.length > 0) {
    appendLogLine(`${prefix} ${remainder}`);
  }

  return { ...state, partialBuffers };
}

function wrapLine(line: string, width: number): string[] {
  const safeWidth = Math.max(width, 1);
  if (line.length <= safeWidth) {
    return [line];
  }

  const wrapped: string[] = [];
  for (let index = 0; index < line.length; index += safeWidth) {
    wrapped.push(line.slice(index, index + safeWidth));
  }
  return wrapped;
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

function padLine(line: string, width: number): string {
  return truncateLine(line, width).padEnd(width, ' ');
}

function fitLinesAroundFocus(lines: string[], count: number, focusIndex: number): string[] {
  if (lines.length <= count) {
    return [...lines, ...Array.from({ length: count - lines.length }, () => '')];
  }

  const visibleCount = Math.max(count, 1);
  const initialStart = Math.max(focusIndex - Math.floor(visibleCount / 2), 0);
  const start = Math.min(initialStart, lines.length - visibleCount);
  const visible = lines.slice(start, start + visibleCount);

  if (start > 0 && visible.length > 0) {
    visible[0] = '...';
  }
  if (start + visibleCount < lines.length && visible.length > 0) {
    visible[visible.length - 1] = '...';
  }

  return visible;
}
