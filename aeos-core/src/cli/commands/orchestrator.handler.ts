// CLI command — aeos orchestrator run | pause | resume | clear-budget | status

import type { Handlers } from '../generated/commands.gen.js';
import type { CommandContext } from '../resources.js';
import { done, stopped } from '../result.js';
import { withColumnLabels } from '../../domain/services/column-labels.js';
import { createJsonLinesDisplay, createTicketRunDisplay } from '../ui/ticket-run-display.js';

/** Halt reasons that mean "finished cleanly", as opposed to "stopped early". */
const CLEAN_HALTS = new Set(['COMPLETE', 'HUMAN_GATE', 'AWAITING_APPROVAL']);

/**
 * `label` puts column labels into text built with identifiers: step outcomes
 * and halt messages, which are stored with identifiers.
 */
function resolveProject(context: CommandContext): {
  id: string;
  path: string;
  label: (text: string) => string;
} {
  const { projectPath, container } = context;
  const labels = container.columnLabels(projectPath);
  return {
    id: container.projectRepo.read(projectPath).id,
    path: projectPath,
    label: (text) => withColumnLabels(text, labels),
  };
}

export const orchestratorRun: Handlers['orchestratorRun'] = async (
  { epicId },
  options,
  context,
) => {
  const project = resolveProject(context);

  // Reuse the ticket-run live view: each ticket the orchestrator drives
  // renders the same pane as a standalone `aeos ticket run`. Started lazily
  // on the first ticket-run event, so an immediate halt (no runs) prints
  // its summary normally rather than flashing a blank screen.
  const display = options.json
    ? createJsonLinesDisplay()
    : createTicketRunDisplay(process.stdout, project.label);
  let displayStarted = false;

  // Capture the instance so SIGINT interrupts the same run it started.
  const orchestrator = context.container.orchestrator;
  const interruptHandler = () => {
    display.requestInterrupt();
    orchestrator.interrupt();
  };
  process.once('SIGINT', interruptHandler);

  let result;
  try {
    result = await orchestrator.run(
      project.id,
      project.path,
      epicId,
      { budgetUsd: options.budget, maxSteps: options.maxSteps },
      {
        ticketRunObserver: {
          onEvent(event) {
            if (!displayStarted) {
              displayStarted = true;
              display.start();
            }
            display.observer.onEvent?.(event);
          },
        },
        onStep(step) {
          if (options.json) {
            process.stderr.write(`${JSON.stringify({ type: 'orchestrator.step', ...step })}\n`);
          } else if (!display.live) {
            // In the live pane, interleaving plain lines would corrupt the
            // alt-screen; the per-ticket view and the end-of-run summary carry
            // it instead. Without a TTY, print each step as it happens.
            // eslint-disable-next-line no-console
            console.log(project.label(`  ${step.ticketId} [${step.column}]: ${step.outcome}`));
          }
        },
      },
    );
  } finally {
    process.removeListener('SIGINT', interruptHandler);
    if (displayStarted) display.stop();
  }

  const summary: string[] = [];
  // The live pane suppressed inline step lines — replay them after the
  // screen is torn down so the run is legible in scroll-back.
  if (display.live) {
    for (const step of result.steps) {
      summary.push(project.label(`  ${step.ticketId} [${step.column}]: ${step.outcome}`));
    }
  }
  const { haltReason, message, spentUsd } = result;
  summary.push(
    '',
    `${CLEAN_HALTS.has(haltReason) ? '✓' : '⏸'} ${result.epicId} — ${haltReason}`,
    `  ${project.label(message)}`,
    `  ${result.steps.length} action(s), $${spentUsd.toFixed(2)} spent`,
  );
  const text = summary.join('\n');
  const data = { epicId: result.epicId, haltReason, message, steps: result.steps.length, spentUsd };

  return haltReason === 'COMPLETE'
    ? done(data, text)
    : stopped({ haltReason }, haltReason, message, { data, text, stream: 'stdout' });
};

export const orchestratorPause: Handlers['orchestratorPause'] = async (
  { epicId },
  _options,
  context,
) => {
  const project = resolveProject(context);
  const state = context.container.orchestrator.pause(project.id, epicId);
  return done({ epicId: state.epicId, paused: true }, `⏸ ${state.epicId} paused`);
};

export const orchestratorResume: Handlers['orchestratorResume'] = async (
  { epicId },
  _options,
  context,
) => {
  const project = resolveProject(context);
  const state = context.container.orchestrator.resume(project.id, epicId);
  return done({ epicId: state.epicId, paused: false }, `▶ ${state.epicId} resumed`);
};

export const orchestratorClearBudget: Handlers['orchestratorClearBudget'] = async (
  { epicId },
  _options,
  context,
) => {
  const project = resolveProject(context);
  const state = context.container.orchestrator.clearBudget(project.id, epicId);
  return done(
    { epicId: state.epicId, budgetUsd: null },
    `✓ ${state.epicId} budget cleared (no ceiling)`,
  );
};

export const orchestratorStatus: Handlers['orchestratorStatus'] = async (
  { epicId },
  _options,
  context,
) => {
  const project = resolveProject(context);
  const { orchestrator } = context.container;

  const states = orchestrator.status(project.id, epicId);
  const epics = states.map((state) => ({
    epicId: state.epicId,
    status: state.status,
    haltReason: state.haltReason,
    message: state.message,
    paused: state.status === 'PAUSED',
    budgetUsd: state.budgetUsd,
    spentUsd: orchestrator.spentUsd(project.id, state.epicId),
  }));
  if (states.length === 0) {
    return done({ epics }, 'No epics have been driven by the orchestrator yet.');
  }

  const text = states.flatMap((state) => {
    const budget = state.budgetUsd === null ? 'no ceiling' : `$${state.budgetUsd.toFixed(2)}`;
    return [
      `${state.epicId}  ${state.status}  (budget: ${budget})`,
      ...(state.haltReason ? [`  last halt: ${state.haltReason}`] : []),
      ...(state.message ? [`  ${project.label(state.message)}`] : []),
    ];
  });
  return done({ epics }, text.join('\n'));
};
