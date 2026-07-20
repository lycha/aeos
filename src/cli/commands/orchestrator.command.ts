// CLI command — aeos orchestrator run | pause | resume | status

import type { Command } from 'commander';
import type { OrchestratorPort } from '../../domain/ports/driving/orchestrator.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

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

      try {
        const result = await getOrchestrator().run(
          project.id,
          project.path,
          epicId,
          { budgetUsd: options.budget, maxSteps: options.maxSteps },
          {
            onStep(step) {
              // eslint-disable-next-line no-console
              console.log(`  ${step.ticketId}: ${step.outcome}`);
            },
          },
        );

        // eslint-disable-next-line no-console
        console.log(
          [
            '',
            `${CLEAN_HALTS.has(result.haltReason) ? '✓' : '⏸'} ${result.epicId} — ${result.haltReason}`,
            `  ${result.message}`,
            `  ${result.steps.length} action(s), $${result.spentUsd.toFixed(2)} spent`,
          ].join('\n'),
        );

        if (!CLEAN_HALTS.has(result.haltReason)) {
          process.exitCode = 1;
        }
      } catch (err) {
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
