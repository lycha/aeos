// GENERATED from cli-contract.yaml — do not edit

import type { Command } from 'commander';

import { render, setProcessExit } from '../render.js';
import type { CommandContext, Resources } from '../resources.js';
import { failed, missingResource, stopped, type CommandResult } from '../result.js';
import {
  COMMAND_RESOURCES,
  type Declared,
  type OperationId,
  type ResourceName,
} from './resources.gen.js';
import type * as T from './types.gen.js';

type Handler<Id extends OperationId, Args, Options, Data> = (
  args: Args,
  options: Options,
  context: CommandContext<Declared<Id>>,
) => Promise<CommandResult<Data>>;

/** One handler per command, by operationId. */
export interface Handlers {
  install: Handler<'install', T.InstallArgs, T.InstallOptions, T.InstallData>;
  projectInit: Handler<'projectInit', T.ProjectInitArgs, T.ProjectInitOptions, T.ProjectInitData>;
  projectSync: Handler<'projectSync', T.ProjectSyncArgs, T.ProjectSyncOptions, T.ProjectSyncData>;
  ticketCreate: Handler<'ticketCreate', T.TicketCreateArgs, T.TicketCreateOptions, T.TicketCreateData>;
  ticketList: Handler<'ticketList', T.TicketListArgs, T.TicketListOptions, T.TicketListData>;
  ticketShow: Handler<'ticketShow', T.TicketShowArgs, T.TicketShowOptions, T.TicketShowData>;
  ticketAnswer: Handler<'ticketAnswer', T.TicketAnswerArgs, T.TicketAnswerOptions, T.TicketAnswerData>;
  ticketResolve: Handler<'ticketResolve', T.TicketResolveArgs, T.TicketResolveOptions, T.TicketResolveData>;
  ticketRun: Handler<'ticketRun', T.TicketRunArgs, T.TicketRunOptions, T.TicketRunData>;
  ticketApprove: Handler<'ticketApprove', T.TicketApproveArgs, T.TicketApproveOptions, T.TicketApproveData>;
  ticketSignOff: Handler<'ticketSignOff', T.TicketSignOffArgs, T.TicketSignOffOptions, T.TicketSignOffData>;
  ticketMove: Handler<'ticketMove', T.TicketMoveArgs, T.TicketMoveOptions, T.TicketMoveData>;
  ticketReady: Handler<'ticketReady', T.TicketReadyArgs, T.TicketReadyOptions, T.TicketReadyData>;
  ticketDodApprove: Handler<'ticketDodApprove', T.TicketDodApproveArgs, T.TicketDodApproveOptions, T.TicketDodApproveData>;
  ticketRepin: Handler<'ticketRepin', T.TicketRepinArgs, T.TicketRepinOptions, T.TicketRepinData>;
  orchestratorRun: Handler<'orchestratorRun', T.OrchestratorRunArgs, T.OrchestratorRunOptions, T.OrchestratorRunData>;
  orchestratorPause: Handler<'orchestratorPause', T.OrchestratorPauseArgs, T.OrchestratorPauseOptions, T.OrchestratorPauseData>;
  orchestratorResume: Handler<'orchestratorResume', T.OrchestratorResumeArgs, T.OrchestratorResumeOptions, T.OrchestratorResumeData>;
  orchestratorClearBudget: Handler<'orchestratorClearBudget', T.OrchestratorClearBudgetArgs, T.OrchestratorClearBudgetOptions, T.OrchestratorClearBudgetData>;
  orchestratorStatus: Handler<'orchestratorStatus', T.OrchestratorStatusArgs, T.OrchestratorStatusOptions, T.OrchestratorStatusData>;
  costs: Handler<'costs', T.CostsArgs, T.CostsOptions, T.CostsData>;
}

const integer = (value: string): number => parseInt(value, 10);
const list =
  (separator: string) =>
  (value: string): string[] =>
    value
      .split(separator)
      .map((item) => item.trim())
      .filter(Boolean);

/** The subset of JSON Schema a parameter may carry (the header of the contract fixes it). */
interface ParameterSchema {
  readonly type?: string;
  readonly enum?: readonly string[];
  readonly pattern?: string;
  readonly minimum?: number;
  readonly exclusiveMinimum?: number;
  readonly format?: string;
  readonly items?: ParameterSchema;
}

/** What is wrong with a value, or null. */
function violation(value: unknown, schema: ParameterSchema): string | null {
  if (Array.isArray(value)) {
    return value.map((item) => violation(item, schema.items ?? {})).find(Boolean) ?? null;
  }
  if ((schema.type === 'number' || schema.type === 'integer') && Number.isNaN(value)) {
    return 'must be a number';
  }
  if (schema.enum && !schema.enum.includes(String(value))) {
    return `must be one of ${schema.enum.join(', ')}`;
  }
  if (schema.pattern && !new RegExp(schema.pattern).test(String(value))) {
    return `must match ${schema.pattern}`;
  }
  if (schema.minimum !== undefined && Number(value) < schema.minimum) {
    return `must be at least ${schema.minimum}`;
  }
  if (schema.exclusiveMinimum !== undefined && Number(value) <= schema.exclusiveMinimum) {
    return `must be greater than ${schema.exclusiveMinimum}`;
  }
  if (schema.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return 'must be a date as YYYY-MM-DD';
  }
  return null;
}

/**
 * Checks the parameters, then the resources, then runs the handler; the first
 * thing wrong stops it. Whatever the outcome, this is where it is written.
 */
async function run<Id extends OperationId, Data>(
  resources: Resources,
  setExit: (code: number) => void,
  id: Id,
  command: string,
  options: { json?: boolean },
  checks: readonly (readonly [string, unknown, ParameterSchema])[],
  handle: (context: CommandContext<Declared<Id>>) => Promise<CommandResult<Data>>,
): Promise<void> {
  let result: CommandResult<unknown>;
  try {
    const require = (resource: ResourceName): CommandResult<never> | null =>
      resources.inPlace(resource, options) ? null : missingResource(resource);
    const invalid = checks
      .filter(([, value]) => value !== undefined)
      .map(([name, value, schema]) => [name, value, violation(value, schema)] as const)
      .find(([, , problem]) => problem !== null);
    const requires: readonly ResourceName[] = COMMAND_RESOURCES[id].requires;
    const missing = invalid
      ? undefined
      : requires.find((resource) => !resources.inPlace(resource, options));
    result = invalid
      ? stopped('usage', 'INVALID_ARGUMENT', `${invalid[0]} ${invalid[2]}, got '${String(invalid[1])}'.`)
      : missing
        ? missingResource(missing)
        : await handle(resources.context(require));
  } catch (error) {
    result = failed(error);
  }
  render(command, result, options.json === true, setExit);
}

/** Builds the whole command tree from the contract. */
export function registerGenerated(
  program: Command,
  handlers: Handlers,
  resources: Resources,
  setExit: (code: number) => void = setProcessExit,
): void {

  program
    .command('install')
    .description('One-time global setup')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((options: T.InstallOptions) =>
      run(resources, setExit, 'install', 'install', options, [
      ], (context) =>
        handlers.install({}, options, context),
      ),
    );

  const project = program.command('project');

  project
    .command('init')
    .description('Initialise a project in the current directory')
    .option('--name <name>', 'Project name (defaults to directory name)')
    .option('--key <key>', 'Ticket prefix key (2–4 uppercase letters)')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((options: T.ProjectInitOptions) =>
      run(resources, setExit, 'projectInit', 'project init', options, [
        ['--key', options.key, { type: 'string', pattern: '^[A-Z]{2,4}$' }],
      ], (context) =>
        handlers.projectInit({}, options, context),
      ),
    );

  project
    .command('sync')
    .description('Reconcile this project\'s column specs, agents, and rubrics with the current templates')
    .option('--apply', 'Write files that are missing from the project')
    .option('--force', 'Also overwrite drifted files (each backed up to <file>.bak). Implies --apply')
    .option('--diff', 'Show a line diff for each drifted file')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((options: T.ProjectSyncOptions) =>
      run(resources, setExit, 'projectSync', 'project sync', options, [
      ], (context) =>
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
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((title: string, options: T.TicketCreateOptions) =>
      run(resources, setExit, 'ticketCreate', 'ticket create', options, [
        ['--implements', options.implements, { type: 'array', items: { type: 'string', pattern: '^AC-[0-9]+[a-z]?$' } }],
      ], (context) =>
        handlers.ticketCreate({ title }, options, context),
      ),
    );

  ticket
    .command('list')
    .description('List all tickets in the current project')
    .option('--column <column>', 'Filter by pipeline column')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((options: T.TicketListOptions) =>
      run(resources, setExit, 'ticketList', 'ticket list', options, [
      ], (context) =>
        handlers.ticketList({}, options, context),
      ),
    );

  ticket
    .command('show')
    .description('Show details of a single ticket')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((id: string, options: T.TicketShowOptions) =>
      run(resources, setExit, 'ticketShow', 'ticket show', options, [
      ], (context) =>
        handlers.ticketShow({ id }, options, context),
      ),
    );

  ticket
    .command('answer')
    .description('Unblock a BLOCKED ticket after answering preflight questions')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .option('--yes', 'Answer yes to this command\'s confirmation')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((id: string, options: T.TicketAnswerOptions) =>
      run(resources, setExit, 'ticketAnswer', 'ticket answer', options, [
      ], (context) =>
        handlers.ticketAnswer({ id }, options, context),
      ),
    );

  ticket
    .command('resolve')
    .description('Resume an ESCALATED ticket after writing a decision in its escalation.md')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .option('--yes', 'Answer yes to this command\'s confirmation')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((id: string, options: T.TicketResolveOptions) =>
      run(resources, setExit, 'ticketResolve', 'ticket resolve', options, [
      ], (context) =>
        handlers.ticketResolve({ id }, options, context),
      ),
    );

  ticket
    .command('run')
    .description('Run the full column cycle for a ticket (preflight → executor → review → sign-off)')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .option('--executor <type>', 'Override executor type (claude-cli, auggie-cli, opencode-cli, ollama-cli)')
    .option('--model <model>', 'Override model identifier')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((id: string, options: T.TicketRunOptions) =>
      run(resources, setExit, 'ticketRun', 'ticket run', options, [
        ['--executor', options.executor, { type: 'string', enum: ['claude-cli', 'auggie-cli', 'opencode-cli', 'ollama-cli'] }],
      ], (context) =>
        handlers.ticketRun({ id }, options, context),
      ),
    );

  ticket
    .command('approve')
    .description('Advance a SIGNED_OFF ticket to the next pipeline column')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .option('--contract', 'Also approve the contract or schema change this ticket carries')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((id: string, options: T.TicketApproveOptions) =>
      run(resources, setExit, 'ticketApprove', 'ticket approve', options, [
      ], (context) =>
        handlers.ticketApprove({ id }, options, context),
      ),
    );

  ticket
    .command('sign-off')
    .description('Manually set a ticket sub-state to SIGNED_OFF')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .requiredOption('--reason <text>', 'Why the review is being overridden. Recorded as a gate')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((id: string, options: T.TicketSignOffOptions) =>
      run(resources, setExit, 'ticketSignOff', 'ticket sign-off', options, [
      ], (context) =>
        handlers.ticketSignOff({ id }, options, context),
      ),
    );

  ticket
    .command('move')
    .description('Move a ticket to any workflow status')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .argument('<status>', 'Target workflow status / column')
    .requiredOption('--reason <text>', 'Why the normal path is being bypassed. Recorded as a gate')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((id: string, status: string, options: T.TicketMoveOptions) =>
      run(resources, setExit, 'ticketMove', 'ticket move', options, [
      ], (context) =>
        handlers.ticketMove({ id, status }, options, context),
      ),
    );

  ticket
    .command('ready')
    .description('Set a ticket sub-state to READY')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((id: string, options: T.TicketReadyOptions) =>
      run(resources, setExit, 'ticketReady', 'ticket ready', options, [
      ], (context) =>
        handlers.ticketReady({ id }, options, context),
      ),
    );

  ticket
    .command('dod-approve')
    .description('Review DoD checklist and approve a DOD_GATE ticket as DONE')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .option('--reason <text>', 'Required when any criterion is failed or unverified')
    .option('--verified <ids>', 'Criteria a person vouches for, comma-separated (e.g. AC-3,AC-7). Each gains a human instrument citing the gate record', list(','))
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((id: string, options: T.TicketDodApproveOptions) =>
      run(resources, setExit, 'ticketDodApprove', 'ticket dod-approve', options, [
        ['--verified', options.verified, { type: 'array', items: { type: 'string', pattern: '^AC-[0-9]+[a-z]?$' } }],
      ], (context) =>
        handlers.ticketDodApprove({ id }, options, context),
      ),
    );

  ticket
    .command('repin')
    .description('Move a spec-backed ticket\'s pin to the current spec after an amendment')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((id: string, options: T.TicketRepinOptions) =>
      run(resources, setExit, 'ticketRepin', 'ticket repin', options, [
      ], (context) =>
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
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((epicId: string, options: T.OrchestratorRunOptions) =>
      run(resources, setExit, 'orchestratorRun', 'orchestrator run', options, [
        ['--budget', options.budget, { type: 'number', exclusiveMinimum: 0 }],
        ['--max-steps', options.maxSteps, { type: 'integer', minimum: 1 }],
      ], (context) =>
        handlers.orchestratorRun({ epicId }, options, context),
      ),
    );

  orchestrator
    .command('pause')
    .description('Stop scheduling new work for an epic (in-flight runs finish)')
    .argument('<epicId>', 'Epic ticket ID')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((epicId: string, options: T.OrchestratorPauseOptions) =>
      run(resources, setExit, 'orchestratorPause', 'orchestrator pause', options, [
      ], (context) =>
        handlers.orchestratorPause({ epicId }, options, context),
      ),
    );

  orchestrator
    .command('resume')
    .description('Allow an epic to be scheduled again')
    .argument('<epicId>', 'Epic ticket ID')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((epicId: string, options: T.OrchestratorResumeOptions) =>
      run(resources, setExit, 'orchestratorResume', 'orchestrator resume', options, [
      ], (context) =>
        handlers.orchestratorResume({ epicId }, options, context),
      ),
    );

  orchestrator
    .command('clear-budget')
    .description('Remove the budget ceiling from an epic')
    .argument('<epicId>', 'Epic ticket ID')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((epicId: string, options: T.OrchestratorClearBudgetOptions) =>
      run(resources, setExit, 'orchestratorClearBudget', 'orchestrator clear-budget', options, [
      ], (context) =>
        handlers.orchestratorClearBudget({ epicId }, options, context),
      ),
    );

  orchestrator
    .command('status')
    .description('Show orchestrator state for one epic or all of them')
    .argument('[epicId]', 'Epic ticket ID')
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((epicId: string | undefined, options: T.OrchestratorStatusOptions) =>
      run(resources, setExit, 'orchestratorStatus', 'orchestrator status', options, [
      ], (context) =>
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
    .option('--json', 'Write one JSON envelope to stdout instead of text')
    .action((options: T.CostsOptions) =>
      run(resources, setExit, 'costs', 'costs', options, [
        ['--since', options.since, { type: 'string', format: 'date' }],
      ], (context) =>
        handlers.costs({}, options, context),
      ),
    );
}
