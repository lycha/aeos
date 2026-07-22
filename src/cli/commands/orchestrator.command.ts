// CLI command — aeos orchestrator run | pause | resume | status

import type { Command } from 'commander';
import type { OrchestratorPort } from '../../domain/ports/driving/orchestrator.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import { createTicketRunDisplay } from '../ui/ticket-run-display.js';

/** Halt reasons that mean "finished cleanly", as opposed to "stopped early". */
const CLEAN_HALTS = new Set(['COMPLETE', 'HUMAN_GATE', 'AWAITING_APPROVAL']);

export function registerOrchestratorCommand(
  program: Command,
  getOrchestrator: () => OrchestratorPort,
  projectRepo: ProjectRepository,
): void {
  const orchestratorCmd =
    program.commands.find((c) => c.name() === 'orchestrator') ??
    program.command('orchestrator').description('Drive an epic and its tasks autonomously');

  function resolveProject(): { id: string; path: string } | null {
    const projectPath = projectRepo.findRoot(process.cwd());
    if (!projectPath) {
      // eslint-disable-next-line no-console
      console.error('Error: No AEOS project found. Run "aeos project init" first.');
      process.exitCode = 1;
      return null;
    }
    return { id: projectRepo.read(projectPath).id, path: projectPath };
  }

  orchestratorCmd
    .command('run')
    .description('Run an epic until it completes, needs a human, or hits its budget')
    .argument('<epicId>', 'Epic ticket ID')
    .option('--budget <usd>', 'USD ceiling for this epic (persisted for later runs)', parseFloat)
    .option('--max-steps <n>', 'Safety bound on scheduled actions', (v) => parseInt(v, 10))
    .action(async (epicId: string, options: { budget?: number; maxSteps?: number }) => {
      const project = resolveProject();
      if (!project) return;

      // Reuse the ticket-run live view: each ticket the orchestrator drives
      // renders the same pane as a standalone `aeos ticket run`. Started lazily
      // on the first ticket-run event, so an immediate halt (no runs) prints
      // its summary normally rather than flashing a blank screen.
      const display = createTicketRunDisplay(process.stdout);
      let displayStarted = false;

      // Capture the instance so SIGINT interrupts the same run it started.
      const orchestrator = getOrchestrator();
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
                console.log(`  ${step.ticketId} [${step.column}]: ${step.outcome}`);
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
            summary.push(`  ${step.ticketId} [${step.column}]: ${step.outcome}`);
          }
        }
        summary.push(
          '',
          `${CLEAN_HALTS.has(result.haltReason) ? '✓' : '⏸'} ${result.epicId} — ${result.haltReason}`,
          `  ${result.message}`,
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
    });

  orchestratorCmd
    .command('pause')
    .description('Stop scheduling new work for an epic (in-flight runs finish)')
    .argument('<epicId>', 'Epic ticket ID')
    .action((epicId: string) => {
      const project = resolveProject();
      if (!project) return;
      const state = getOrchestrator().pause(project.id, epicId);
      // eslint-disable-next-line no-console
      console.log(`⏸ ${state.epicId} paused`);
    });

  orchestratorCmd
    .command('resume')
    .description('Allow an epic to be scheduled again')
    .argument('<epicId>', 'Epic ticket ID')
    .action((epicId: string) => {
      const project = resolveProject();
      if (!project) return;
      const state = getOrchestrator().resume(project.id, epicId);
      // eslint-disable-next-line no-console
      console.log(`▶ ${state.epicId} resumed`);
    });

  orchestratorCmd
    .command('status')
    .description('Show orchestrator state for one epic or all of them')
    .argument('[epicId]', 'Epic ticket ID')
    .action((epicId?: string) => {
      const project = resolveProject();
      if (!project) return;

      const states = getOrchestrator().status(project.id, epicId);
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
            state.message ? `  ${state.message}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }
    });
}
