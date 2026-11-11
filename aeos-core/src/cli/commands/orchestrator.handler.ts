// CLI command — aeos orchestrator run | pause | resume | clear-budget | status

import type { Handlers } from '../generated/commands.gen.js';
import type { CommandContext } from '../resources.js';
import { withColumnLabels } from '../../domain/services/column-labels.js';
import { createTicketRunDisplay } from '../ui/ticket-run-display.js';

/** Halt reasons that mean "finished cleanly", as opposed to "stopped early". */
const CLEAN_HALTS = new Set(['COMPLETE', 'HUMAN_GATE', 'AWAITING_APPROVAL']);

/**
 * `label` puts column labels into text built with identifiers: step outcomes
 * and halt messages, which are stored with identifiers.
 */
function resolveProject(
  context: CommandContext,
): { id: string; path: string; label: (text: string) => string } | null {
  const { projectPath, container } = context;
  try {
    const labels = container.columnLabels(projectPath);
    return {
      id: container.projectRepo.read(projectPath).id,
      path: projectPath,
      label: (text) => withColumnLabels(text, labels),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return null;
  }
}

export const orchestratorRun: Handlers['orchestratorRun'] = async (
  { epicId },
  options,
  context,
) => {
  const project = resolveProject(context);
  if (!project) return;

  // Reuse the ticket-run live view: each ticket the orchestrator drives
  // renders the same pane as a standalone `aeos ticket run`. Started lazily
  // on the first ticket-run event, so an immediate halt (no runs) prints
  // its summary normally rather than flashing a blank screen.
  const display = createTicketRunDisplay(process.stdout, project.label);
  let displayStarted = false;

  // Capture the instance so SIGINT interrupts the same run it started.
  const orchestrator = context.container.orchestrator;
  const interruptHandler = () => {
    display.requestInterrupt();
    orchestrator.interrupt();
  };
  process.once('SIGINT', interruptHandler);

  try {
    const result = await orchestrator.run(
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
          // In the live pane, interleaving plain lines would corrupt the
          // alt-screen; the per-ticket view and the end-of-run summary carry
          // it instead. Without a TTY, print each step as it happens.
          if (!display.live) {
            // eslint-disable-next-line no-console
            console.log(project.label(`  ${step.ticketId} [${step.column}]: ${step.outcome}`));
          }
        },
      },
    );

    process.removeListener('SIGINT', interruptHandler);
    if (displayStarted) display.stop();

    const summary: string[] = [];
    // The live pane suppressed inline step lines — replay them after the
    // screen is torn down so the run is legible in scroll-back.
    if (display.live) {
      for (const step of result.steps) {
        summary.push(project.label(`  ${step.ticketId} [${step.column}]: ${step.outcome}`));
      }
    }
    summary.push(
      '',
      `${CLEAN_HALTS.has(result.haltReason) ? '✓' : '⏸'} ${result.epicId} — ${result.haltReason}`,
      `  ${project.label(result.message)}`,
      `  ${result.steps.length} action(s), $${result.spentUsd.toFixed(2)} spent`,
    );
    // eslint-disable-next-line no-console
    console.log(summary.join('\n'));

    if (!CLEAN_HALTS.has(result.haltReason)) {
      // 130 is the conventional "terminated by Ctrl+C" code.
      process.exitCode = result.haltReason === 'INTERRUPTED' ? 130 : 1;
    }
  } catch (err) {
    process.removeListener('SIGINT', interruptHandler);
    if (displayStarted) display.stop();
    // eslint-disable-next-line no-console
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
};

export const orchestratorPause: Handlers['orchestratorPause'] = async (
  { epicId },
  _options,
  context,
) => {
  const project = resolveProject(context);
  if (!project) return;
  const state = context.container.orchestrator.pause(project.id, epicId);
  // eslint-disable-next-line no-console
  console.log(`⏸ ${state.epicId} paused`);
};

export const orchestratorResume: Handlers['orchestratorResume'] = async (
  { epicId },
  _options,
  context,
) => {
  const project = resolveProject(context);
  if (!project) return;
  const state = context.container.orchestrator.resume(project.id, epicId);
  // eslint-disable-next-line no-console
  console.log(`▶ ${state.epicId} resumed`);
};

export const orchestratorClearBudget: Handlers['orchestratorClearBudget'] = async (
  { epicId },
  _options,
  context,
) => {
  const project = resolveProject(context);
  if (!project) return;
  const state = context.container.orchestrator.clearBudget(project.id, epicId);
  // eslint-disable-next-line no-console
  console.log(`✓ ${state.epicId} budget cleared (no ceiling)`);
};

export const orchestratorStatus: Handlers['orchestratorStatus'] = async (
  { epicId },
  _options,
  context,
) => {
  const project = resolveProject(context);
  if (!project) return;

  const states = context.container.orchestrator.status(project.id, epicId);
  if (states.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No epics have been driven by the orchestrator yet.');
    return;
  }

  for (const state of states) {
    const budget = state.budgetUsd === null ? 'no ceiling' : `$${state.budgetUsd.toFixed(2)}`;
    // eslint-disable-next-line no-console
    console.log(
      [
        `${state.epicId}  ${state.status}  (budget: ${budget})`,
        state.haltReason ? `  last halt: ${state.haltReason}` : null,
        state.message ? `  ${project.label(state.message)}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
};
