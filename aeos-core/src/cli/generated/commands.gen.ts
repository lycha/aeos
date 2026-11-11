// GENERATED from cli-contract.yaml — do not edit
/* eslint-disable no-console */

import type { Command } from 'commander';

import type { CommandContext, Resources } from '../resources.js';
import {
  COMMAND_RESOURCES,
  RESOURCES,
  type Declared,
  type OperationId,
  type ResourceName,
} from './resources.gen.js';
import type * as T from './types.gen.js';

type Handler<Id extends OperationId, Args, Options> = (
  args: Args,
  options: Options,
  context: CommandContext<Declared<Id>>,
) => Promise<void>;

/** One handler per command, by operationId. */
export interface Handlers {
  install: Handler<'install', T.InstallArgs, T.InstallOptions>;
  projectInit: Handler<'projectInit', T.ProjectInitArgs, T.ProjectInitOptions>;
  projectSync: Handler<'projectSync', T.ProjectSyncArgs, T.ProjectSyncOptions>;
  ticketCreate: Handler<'ticketCreate', T.TicketCreateArgs, T.TicketCreateOptions>;
  ticketList: Handler<'ticketList', T.TicketListArgs, T.TicketListOptions>;
  ticketShow: Handler<'ticketShow', T.TicketShowArgs, T.TicketShowOptions>;
  ticketAnswer: Handler<'ticketAnswer', T.TicketAnswerArgs, T.TicketAnswerOptions>;
  ticketResolve: Handler<'ticketResolve', T.TicketResolveArgs, T.TicketResolveOptions>;
  ticketRun: Handler<'ticketRun', T.TicketRunArgs, T.TicketRunOptions>;
  ticketApprove: Handler<'ticketApprove', T.TicketApproveArgs, T.TicketApproveOptions>;
  ticketSignOff: Handler<'ticketSignOff', T.TicketSignOffArgs, T.TicketSignOffOptions>;
  ticketMove: Handler<'ticketMove', T.TicketMoveArgs, T.TicketMoveOptions>;
  ticketReady: Handler<'ticketReady', T.TicketReadyArgs, T.TicketReadyOptions>;
  ticketDodApprove: Handler<'ticketDodApprove', T.TicketDodApproveArgs, T.TicketDodApproveOptions>;
  ticketRepin: Handler<'ticketRepin', T.TicketRepinArgs, T.TicketRepinOptions>;
  orchestratorRun: Handler<'orchestratorRun', T.OrchestratorRunArgs, T.OrchestratorRunOptions>;
  orchestratorPause: Handler<'orchestratorPause', T.OrchestratorPauseArgs, T.OrchestratorPauseOptions>;
  orchestratorResume: Handler<'orchestratorResume', T.OrchestratorResumeArgs, T.OrchestratorResumeOptions>;
  orchestratorClearBudget: Handler<'orchestratorClearBudget', T.OrchestratorClearBudgetArgs, T.OrchestratorClearBudgetOptions>;
  orchestratorStatus: Handler<'orchestratorStatus', T.OrchestratorStatusArgs, T.OrchestratorStatusOptions>;
  costs: Handler<'costs', T.CostsArgs, T.CostsOptions>;
}

const integer = (value: string): number => parseInt(value, 10);
const list =
  (separator: string) =>
  (value: string): string[] =>
    value
      .split(separator)
      .map((item) => item.trim())
      .filter(Boolean);

/** Checks the command's resources, then runs its handler. The first one missing stops it. */
async function run<Id extends OperationId>(
  resources: Resources,
  id: Id,
  options: object,
  handle: (context: CommandContext<Declared<Id>>) => Promise<void>,
): Promise<void> {
  const require = (resource: ResourceName): boolean => {
    if (resources.inPlace(resource, options)) return true;
    const { description, fix } = RESOURCES[resource];
    console.error(`Error: a required resource is not in place: ${resource}.\n  ${description}\n  ${fix}`);
    process.exitCode = 1;
    return false;
  };
  const requires: readonly ResourceName[] = COMMAND_RESOURCES[id].requires;
  if (requires.every(require)) await handle(resources.context(require));
}

/** Builds the whole command tree from the contract. */
export function registerGenerated(
  program: Command,
  handlers: Handlers,
  resources: Resources,
): void {

  program
    .command('install')
    .description('One-time global setup')
    .action((options: T.InstallOptions) =>
      run(resources, 'install', options, (context) =>
        handlers.install({}, options, context),
      ),
    );

  const project = program.command('project');

  project
    .command('init')
    .description('Initialise a project in the current directory')
    .option('--name <name>', 'Project name (defaults to directory name)')
    .option('--key <key>', 'Ticket prefix key (2–4 uppercase letters)')
    .action((options: T.ProjectInitOptions) =>
      run(resources, 'projectInit', options, (context) =>
        handlers.projectInit({}, options, context),
      ),
    );

  project
    .command('sync')
    .description('Reconcile this project\'s column specs, agents, and rubrics with the current templates')
    .option('--apply', 'Write files that are missing from the project')
    .option('--force', 'Also overwrite drifted files (each backed up to <file>.bak). Implies --apply')
    .option('--diff', 'Show a line diff for each drifted file')
    .action((options: T.ProjectSyncOptions) =>
      run(resources, 'projectSync', options, (context) =>
        handlers.projectSync({}, options, context),
      ),
    );

  const ticket = program.command('ticket');

  ticket
    .command('create')
    .description('Create a new ticket (an epic by default, or a task with --parent)')
    .argument('<title>', 'Ticket title')
    .option('--parent <epicId>', 'Create this ticket as a task under the given epic, skipping scoping and spec')
    .option('--key <taskKey>', 'Stable decomposition key (e.g. T-001); idempotency matches on it instead of the title')
    .option('--body <markdown>', 'Markdown description for the ticket (e.g. a task breakdown block). Prefer --body-file for multi-line content')
    .option('--body-file <path>', 'Read the ticket description from a file (robust for multi-line markdown)')
    .option('--spec <feature>', 'Back this epic with the spec at .aeos/features/<feature>. Refused unless the decisions lint is clean')
    .option('--bug', 'Create a standalone bug task that must show a reproducing test red, then green')
    .option('--implements <ids>', 'Acceptance criteria this task claims, comma-separated (e.g. AC-1,AC-2)', list(','))
    .action((title: string, options: T.TicketCreateOptions) =>
      run(resources, 'ticketCreate', options, (context) =>
        handlers.ticketCreate({ title }, options, context),
      ),
    );

  ticket
    .command('list')
    .description('List all tickets in the current project')
    .option('--column <column>', 'Filter by pipeline column')
    .action((options: T.TicketListOptions) =>
      run(resources, 'ticketList', options, (context) =>
        handlers.ticketList({}, options, context),
      ),
    );

  ticket
    .command('show')
    .description('Show details of a single ticket')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .action((id: string, options: T.TicketShowOptions) =>
      run(resources, 'ticketShow', options, (context) =>
        handlers.ticketShow({ id }, options, context),
      ),
    );

  ticket
    .command('answer')
    .description('Unblock a BLOCKED ticket after answering preflight questions')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .action((id: string, options: T.TicketAnswerOptions) =>
      run(resources, 'ticketAnswer', options, (context) =>
        handlers.ticketAnswer({ id }, options, context),
      ),
    );

  ticket
    .command('resolve')
    .description('Resume an ESCALATED ticket after writing a decision in its escalation.md')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .action((id: string, options: T.TicketResolveOptions) =>
      run(resources, 'ticketResolve', options, (context) =>
        handlers.ticketResolve({ id }, options, context),
      ),
    );

  ticket
    .command('run')
    .description('Run the full column cycle for a ticket (preflight → executor → review → sign-off)')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .option('--executor <type>', 'Override executor type (claude-cli, auggie-cli, opencode-cli, ollama-cli)')
    .option('--model <model>', 'Override model identifier')
    .action((id: string, options: T.TicketRunOptions) =>
      run(resources, 'ticketRun', options, (context) =>
        handlers.ticketRun({ id }, options, context),
      ),
    );

  ticket
    .command('approve')
    .description('Advance a SIGNED_OFF ticket to the next pipeline column')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .action((id: string, options: T.TicketApproveOptions) =>
      run(resources, 'ticketApprove', options, (context) =>
        handlers.ticketApprove({ id }, options, context),
      ),
    );

  ticket
    .command('sign-off')
    .description('Manually set a ticket sub-state to SIGNED_OFF')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .requiredOption('--reason <text>', 'Why the review is being overridden. Recorded as a gate')
    .action((id: string, options: T.TicketSignOffOptions) =>
      run(resources, 'ticketSignOff', options, (context) =>
        handlers.ticketSignOff({ id }, options, context),
      ),
    );

  ticket
    .command('move')
    .description('Move a ticket to any workflow status')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .argument('<status>', 'Target workflow status / column')
    .requiredOption('--reason <text>', 'Why the normal path is being bypassed. Recorded as a gate')
    .action((id: string, status: string, options: T.TicketMoveOptions) =>
      run(resources, 'ticketMove', options, (context) =>
        handlers.ticketMove({ id, status }, options, context),
      ),
    );

  ticket
    .command('ready')
    .description('Set a ticket sub-state to READY')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .action((id: string, options: T.TicketReadyOptions) =>
      run(resources, 'ticketReady', options, (context) =>
        handlers.ticketReady({ id }, options, context),
      ),
    );

  ticket
    .command('dod-approve')
    .description('Review DoD checklist and approve a DOD_GATE ticket as DONE')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .option('--reason <text>', 'Required when any criterion is failed or unverified')
    .option('--verified <ids>', 'Criteria a person vouches for, comma-separated (e.g. AC-3,AC-7). Each gains a human instrument citing the gate record', list(','))
    .action((id: string, options: T.TicketDodApproveOptions) =>
      run(resources, 'ticketDodApprove', options, (context) =>
        handlers.ticketDodApprove({ id }, options, context),
      ),
    );

  ticket
    .command('repin')
    .description('Move a spec-backed ticket\'s pin to the current spec after an amendment')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .action((id: string, options: T.TicketRepinOptions) =>
      run(resources, 'ticketRepin', options, (context) =>
        handlers.ticketRepin({ id }, options, context),
      ),
    );

  const orchestrator = program.command('orchestrator');

  orchestrator
    .command('run')
    .description('Run an epic until it completes, needs a human, or hits its budget')
    .argument('<epicId>', 'Epic ticket ID')
    .option('--budget <usd>', 'USD ceiling for this epic (persisted for later runs)', parseFloat)
    .option('--max-steps <n>', 'Safety bound on scheduled actions', integer)
    .action((epicId: string, options: T.OrchestratorRunOptions) =>
      run(resources, 'orchestratorRun', options, (context) =>
        handlers.orchestratorRun({ epicId }, options, context),
      ),
    );

  orchestrator
    .command('pause')
    .description('Stop scheduling new work for an epic (in-flight runs finish)')
    .argument('<epicId>', 'Epic ticket ID')
    .action((epicId: string, options: T.OrchestratorPauseOptions) =>
      run(resources, 'orchestratorPause', options, (context) =>
        handlers.orchestratorPause({ epicId }, options, context),
      ),
    );

  orchestrator
    .command('resume')
    .description('Allow an epic to be scheduled again')
    .argument('<epicId>', 'Epic ticket ID')
    .action((epicId: string, options: T.OrchestratorResumeOptions) =>
      run(resources, 'orchestratorResume', options, (context) =>
        handlers.orchestratorResume({ epicId }, options, context),
      ),
    );

  orchestrator
    .command('clear-budget')
    .description('Remove the budget ceiling from an epic')
    .argument('<epicId>', 'Epic ticket ID')
    .action((epicId: string, options: T.OrchestratorClearBudgetOptions) =>
      run(resources, 'orchestratorClearBudget', options, (context) =>
        handlers.orchestratorClearBudget({ epicId }, options, context),
      ),
    );

  orchestrator
    .command('status')
    .description('Show orchestrator state for one epic or all of them')
    .argument('[epicId]', 'Epic ticket ID')
    .action((epicId: string | undefined, options: T.OrchestratorStatusOptions) =>
      run(resources, 'orchestratorStatus', options, (context) =>
        handlers.orchestratorStatus({ epicId }, options, context),
      ),
    );

  program
    .command('costs')
    .description('Report model spend')
    .option('--project <key>', 'Limit to one project')
    .option('--epic <id>', 'One epic and its child tasks')
    .option('--ticket <id>', 'One ticket')
    .option('--since <date>', 'Records from this date on (YYYY-MM-DD)')
    .action((options: T.CostsOptions) =>
      run(resources, 'costs', options, (context) =>
        handlers.costs({}, options, context),
      ),
    );
}
