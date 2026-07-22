import * as readline from 'node:readline';

import type {
  TicketRunEvent,
  TicketRunObserver,
  TicketRunPhase,
} from '../../domain/model/ticket-run-event.js';

const FULL_LAYOUT_COLUMNS = 120;
const MIN_LIVE_COLUMNS = 90;
const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
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

export interface TicketRunDisplay {
  readonly observer: TicketRunObserver;
  readonly live: boolean;
  start(): void;
  stop(): void;
  requestInterrupt(): void;
}

export function createTicketRunDisplay(
  stdout: NodeJS.WriteStream = process.stdout,
): TicketRunDisplay {
  if (stdout.isTTY && (stdout.columns ?? DEFAULT_COLUMNS) >= MIN_LIVE_COLUMNS) {
    return new LiveTicketRunDisplay(stdout);
  }

  return new PlainTicketRunDisplay(stdout);
}

abstract class BaseTicketRunDisplay implements TicketRunDisplay, TicketRunObserver {
  readonly observer: TicketRunObserver = this;
  abstract readonly live: boolean;

  protected ticketId = '—';
  protected column = '—';
  protected agent = '—';
  protected executor = '—';
  protected model = '—';
  protected mode = '—';
  protected subState: string | null = null;
  protected activeStage: TicketRunPhase | null = null;
  protected finalStatus = 'running';
  protected interruptRequested = false;
  protected readonly stageStates = new Map<TicketRunPhase, StageSnapshot>();
  private readonly partialBuffers = new Map<string, string>();

  constructor(protected readonly stdout: NodeJS.WriteStream) {
    for (const phase of PHASE_ORDER) {
      this.stageStates.set(phase, { status: 'pending' });
    }
  }

  start(): void {}

  stop(): void {
    this.flushAllBuffers();
    this.onStop();
  }

  requestInterrupt(): void {
    this.interruptRequested = true;
    this.afterStateChange();
  }

  onEvent(event: TicketRunEvent): void {
    this.ticketId = event.ticketId;
    this.column = event.column;

    switch (event.type) {
      case 'ticket-run.started':
        // Reset the per-run panels so a display reused across an orchestrator's
        // tickets reflects the current ticket, not the previous one. The raw log
        // is intentionally kept so the whole epic's output scrolls back.
        for (const phase of PHASE_ORDER) {
          this.stageStates.set(phase, { status: 'pending' });
        }
        this.partialBuffers.clear();
        this.activeStage = null;
        this.subState = null;
        this.finalStatus = 'running';
        this.agent = '—';
        this.executor = event.payload.executor;
        this.model = event.payload.model ?? '—';
        this.appendLogLine(
          `[run] started | ${event.ticketId} | executor=${this.executor}${event.payload.model ? ` | model=${event.payload.model}` : ''}`,
        );
        break;
      case 'run.attempt.started':
        if (event.payload.attempt > 1) {
          this.appendLogLine(
            `[run] revision attempt ${event.payload.attempt} of ${event.payload.maxAttempts}`,
          );
        }
        break;
      case 'stage.started':
        this.activeStage = event.payload.stage;
        this.stageStates.set(event.payload.stage, {
          status: 'active',
          message: event.payload.message,
        });
        this.agent = event.payload.agent ?? this.agent;
        this.executor = event.payload.executor ?? this.executor;
        this.model = event.payload.model ?? this.model;
        this.mode = event.payload.mode ?? this.mode;
        this.appendLogLine(
          `[stage:${event.payload.stage}] started | ${event.payload.message}` +
            (event.payload.agent ? ` | agent=${event.payload.agent}` : ''),
        );
        break;
      case 'stage.completed':
        this.stageStates.set(event.payload.stage, {
          status: 'completed',
          message: event.payload.message,
        });
        if (this.activeStage === event.payload.stage) {
          this.activeStage = null;
        }
        this.flushStageBuffers(event.payload.stage);
        this.appendLogLine(`[stage:${event.payload.stage}] completed | ${event.payload.message}`);
        break;
      case 'stage.failed':
        this.stageStates.set(event.payload.stage, {
          status: 'failed',
          message: event.payload.message,
        });
        if (this.activeStage === event.payload.stage) {
          this.activeStage = null;
        }
        this.flushStageBuffers(event.payload.stage);
        this.appendLogLine(`[stage:${event.payload.stage}] failed | ${event.payload.message}`);
        break;
      case 'sub-state.changed':
        this.subState = event.payload.to;
        this.appendLogLine(`[state] ${event.payload.from ?? '—'} -> ${event.payload.to ?? '—'}`);
        break;
      case 'artifact.written':
        this.appendLogLine(`[artifact] ${event.payload.role} wrote ${event.payload.path}`);
        break;
      case 'artifact.committed':
        this.appendLogLine(`[git] ${event.payload.role} committed ${event.payload.path}`);
        break;
      case 'review.rejected':
        this.appendLogLine(`[review] rejected | ${event.payload.reason}`);
        break;
      case 'cost.recorded':
        this.appendLogLine(
          `[cost] ${event.payload.role} | in=${event.payload.inputTokens} out=${event.payload.outputTokens} usd=${event.payload.costUsd.toFixed(4)}`,
        );
        break;
      case 'executor.stdout.chunk':
        this.consumeChunk(event.payload.source, 'stdout', event.payload.chunk);
        break;
      case 'executor.stderr.chunk':
        this.consumeChunk(event.payload.source, 'stderr', event.payload.chunk);
        break;
      case 'ticket-run.completed':
        this.finalStatus = 'completed';
        this.flushAllBuffers();
        this.appendLogLine('[run] completed');
        break;
      case 'ticket-run.blocked':
        this.finalStatus = 'blocked';
        this.flushAllBuffers();
        this.appendLogLine(`[run] blocked | ${event.payload.blockers.join('; ')}`);
        break;
      case 'ticket-run.failed':
        this.finalStatus = 'failed';
        this.flushAllBuffers();
        this.appendLogLine(`[run] failed | ${event.payload.message}`);
        break;
      case 'ticket-run.interrupted':
        this.finalStatus = 'interrupted';
        this.flushAllBuffers();
        this.appendLogLine(
          `[run] interrupted${event.payload.stage ? ` at ${event.payload.stage}` : ''} | ${event.payload.message}`,
        );
        break;
      case 'ticket-run.escalated':
        this.finalStatus = 'escalated';
        this.flushAllBuffers();
        this.appendLogLine(`[run] escalated | ${event.payload.reason} | ${event.payload.message}`);
        break;
    }

    this.afterStateChange();
  }

  protected abstract appendLogLine(line: string): void;
  protected abstract afterStateChange(): void;
  protected onStop(): void {}

  protected formatStageLine(phase: TicketRunPhase, width: number): string {
    const snapshot = this.stageStates.get(phase) ?? { status: 'pending' };
    const marker =
      snapshot.status === 'active'
        ? '[>]'
        : snapshot.status === 'completed'
          ? '[x]'
          : snapshot.status === 'failed'
            ? '[!]'
            : '[ ]';
    const label = `${marker} ${PHASE_LABELS[phase]}`;
    const suffix = snapshot.message ? ` ${snapshot.message}` : '';
    return truncateLine(`${label}${suffix}`, width);
  }

  protected consumeChunk(source: ChunkSource, stream: ChunkStream, chunk: string): void {
    const key = `${source}:${stream}`;
    const prefix = `[${source}/${stream}]`;
    const normalized = chunk.replace(/\r/g, '\n');
    const combined = `${this.partialBuffers.get(key) ?? ''}${normalized}`;
    const parts = combined.split('\n');
    const remainder = parts.pop() ?? '';
    this.partialBuffers.set(key, remainder);

    for (const part of parts) {
      this.appendLogLine(part.length === 0 ? prefix : `${prefix} ${part}`);
    }
  }

  private flushStageBuffers(stage: TicketRunPhase): void {
    if (stage === 'preflight' || stage === 'worker' || stage === 'reviewer') {
      this.flushSourceBuffers(stage);
    }
  }

  private flushSourceBuffers(source: ChunkSource): void {
    this.flushPartialBuffer(`${source}:stdout`, `[${source}/stdout]`);
    this.flushPartialBuffer(`${source}:stderr`, `[${source}/stderr]`);
  }

  private flushAllBuffers(): void {
    this.flushSourceBuffers('preflight');
    this.flushSourceBuffers('worker');
    this.flushSourceBuffers('reviewer');
  }

  private flushPartialBuffer(key: string, prefix: string): void {
    const remainder = this.partialBuffers.get(key);
    if (remainder && remainder.length > 0) {
      this.appendLogLine(`${prefix} ${remainder}`);
    }
    this.partialBuffers.delete(key);
  }
}

class PlainTicketRunDisplay extends BaseTicketRunDisplay {
  readonly live = false;
  private interruptLogged = false;

  protected appendLogLine(line: string): void {
    this.stdout.write(`${line}\n`);
  }

  protected afterStateChange(): void {
    if (this.interruptRequested && !this.interruptLogged) {
      this.interruptLogged = true;
      this.stdout.write('[run] interrupt requested; waiting for graceful shutdown...\n');
    }
  }
}

class LiveTicketRunDisplay extends BaseTicketRunDisplay {
  readonly live = true;
  private started = false;
  private renderPending = false;
  private truncatedLines = 0;
  private readonly rawLines: string[] = [];
  private readonly handleResize = (): void => this.scheduleRender();

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.stdout.on('resize', this.handleResize);
    this.stdout.write('\u001B[?1049h\u001B[?25l');
    this.render();
  }

  protected appendLogLine(line: string): void {
    if (this.rawLines.length >= MAX_RAW_LINES) {
      this.rawLines.shift();
      this.truncatedLines += 1;
    }
    this.rawLines.push(line);
  }

  protected afterStateChange(): void {
    this.scheduleRender();
  }

  protected onStop(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.stdout.off('resize', this.handleResize);
    this.stdout.write('\u001B[?25h\u001B[?1049l');
  }

  private scheduleRender(): void {
    if (!this.started || this.renderPending) {
      return;
    }

    this.renderPending = true;
    setImmediate(() => {
      this.renderPending = false;
      if (this.started) {
        this.render();
      }
    });
  }

  private render(): void {
    const columns = Math.max(this.stdout.columns ?? DEFAULT_COLUMNS, MIN_LIVE_COLUMNS);
    const rows = Math.max(this.stdout.rows ?? DEFAULT_ROWS, 12);
    const header = [
      truncateLine(`AEOS ticket run | ${this.ticketId} | ${this.column}`, columns),
      truncateLine(this.buildMetaLine(), columns),
    ];
    const footer = [truncateLine(this.buildFooterLine(columns), columns)];
    const bodyRows = Math.max(rows - header.length - footer.length, 8);
    const body =
      columns >= FULL_LAYOUT_COLUMNS
        ? this.renderSplitBody(columns, bodyRows)
        : this.renderStackedBody(columns, bodyRows);
    const lines = [...header, ...body, ...footer];
    const visibleLines = [...lines.slice(0, rows)];

    while (visibleLines.length < rows) {
      visibleLines.push('');
    }

    readline.cursorTo(this.stdout, 0, 0);
    readline.clearScreenDown(this.stdout);
    this.stdout.write(`${visibleLines.join('\n')}\n`);
  }

  private buildMetaLine(): string {
    return [
      `Stage: ${this.activeStage ? PHASE_LABELS[this.activeStage] : this.finalStatus}`,
      `Agent: ${this.agent}`,
      `Executor: ${this.executor}`,
      `Model: ${this.model}`,
      `Mode: ${this.mode}`,
    ].join(' | ');
  }

  private buildFooterLine(columns: number): string {
    const layout = columns >= FULL_LAYOUT_COLUMNS ? 'split' : 'stacked';
    const state = this.subState ?? '—';
    const interrupt = this.interruptRequested ? ' | Interrupt requested...' : '';
    return `Ctrl+C interrupt | Layout: ${layout} | Result: ${this.finalStatus} | Sub-state: ${state}${interrupt}`;
  }

  private renderSplitBody(columns: number, rows: number): string[] {
    const leftWidth = Math.min(48, Math.max(32, Math.floor(columns * 0.34)));
    const rightWidth = Math.max(columns - leftWidth - 3, 24);
    const leftLines = this.renderSummaryPane(leftWidth, rows);
    const rightLines = this.renderLogPane(rightWidth, rows);
    const rendered: string[] = [];

    for (let index = 0; index < rows; index += 1) {
      rendered.push(
        `${padLine(leftLines[index] ?? '', leftWidth)} | ${padLine(rightLines[index] ?? '', rightWidth)}`,
      );
    }

    return rendered;
  }

  private renderStackedBody(columns: number, rows: number): string[] {
    const summaryRows = Math.min(Math.max(Math.floor(rows * 0.45), 7), rows - 4);
    const logRows = Math.max(rows - summaryRows - 1, 3);
    return [
      ...this.renderSummaryPane(columns, summaryRows),
      '-'.repeat(columns),
      ...this.renderLogPane(columns, logRows),
    ];
  }

  private renderSummaryPane(width: number, rows: number): string[] {
    const metadata = [
      'Stages',
      `Current: ${this.activeStage ? PHASE_LABELS[this.activeStage] : this.finalStatus}`,
      `Agent: ${this.agent}`,
      `Executor: ${this.executor}`,
      `Model: ${this.model}`,
      `Mode: ${this.mode}`,
      `Sub-state: ${this.subState ?? '—'}`,
      '',
    ];
    const stageLines = PHASE_ORDER.map((phase) => this.formatStageLine(phase, width));
    const combined = [...metadata, ...stageLines];
    return fitLinesAroundFocus(
      combined,
      rows,
      metadata.length + Math.max(PHASE_ORDER.indexOf(this.activeStage ?? 'complete'), 0),
    ).map((line) => truncateLine(line, width));
  }

  private renderLogPane(width: number, rows: number): string[] {
    const wrapped: string[] = ['Raw output'];
    if (this.truncatedLines > 0) {
      wrapped.push(`... ${this.truncatedLines} older lines truncated ...`);
    }

    for (const line of this.rawLines) {
      wrapped.push(...wrapLine(line, width));
    }

    const visible = wrapped.slice(-rows);
    while (visible.length < rows) {
      visible.unshift('');
    }

    return visible.map((line) => truncateLine(line, width));
  }
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
  const truncated = truncateLine(line, width);
  return truncated.padEnd(width, ' ');
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
