// GENERATED from cli-contract.yaml — do not edit

export type ResourceName = 'aeos_home' | 'project' | 'state_db' | 'git_repo' | 'executor';

/** What must be in place, and what to do when it is not. */
export const RESOURCES: Record<ResourceName, { description: string; fix: string }> = {
  aeos_home: { description: 'The AEOS home directory exists (AEOS_HOME, default ~/.aeos).', fix: 'Run `aeos install`.' },
  project: { description: 'An initialised project. `.aeos/project.json` is found from the working directory upward.', fix: 'Run `aeos project init` in the project root.' },
  state_db: { description: 'The state database at <AEOS_HOME>/state.db can be opened and migrated.', fix: 'Run `aeos install`, or check AEOS_HOME.' },
  git_repo: { description: 'The project root is inside a git work tree.', fix: 'Run `git init`, or run the command from the repository.' },
  executor: { description: 'The executor CLI resolved for this run is on PATH.', fix: 'Install the executor, or choose another with --executor.' },
};

/** Per operationId: checked before the handler, and what the handler may ask for in a stated case. */
export const COMMAND_RESOURCES = {
  install: { requires: [], conditionalRequires: [] },
  projectInit: { requires: ['aeos_home'], conditionalRequires: [] },
  projectSync: { requires: ['project'], conditionalRequires: [] },
  ticketCreate: { requires: ['project', 'state_db'], conditionalRequires: [] },
  ticketList: { requires: ['project', 'state_db'], conditionalRequires: [] },
  ticketShow: { requires: ['project', 'state_db'], conditionalRequires: [] },
  ticketAnswer: { requires: ['project', 'state_db'], conditionalRequires: [] },
  ticketResolve: { requires: ['project', 'state_db'], conditionalRequires: [] },
  ticketRun: { requires: ['project', 'state_db', 'executor'], conditionalRequires: [] },
  ticketApprove: { requires: ['project', 'state_db', 'git_repo'], conditionalRequires: [] },
  ticketSignOff: { requires: ['project', 'state_db'], conditionalRequires: [] },
  ticketMove: { requires: ['project', 'state_db'], conditionalRequires: [] },
  ticketReady: { requires: ['project', 'state_db'], conditionalRequires: [] },
  ticketDodApprove: { requires: ['project', 'state_db', 'git_repo'], conditionalRequires: [] },
  ticketRepin: { requires: ['project', 'state_db'], conditionalRequires: [] },
  orchestratorRun: { requires: ['project', 'state_db', 'git_repo', 'executor'], conditionalRequires: [] },
  orchestratorPause: { requires: ['project', 'state_db'], conditionalRequires: [] },
  orchestratorResume: { requires: ['project', 'state_db'], conditionalRequires: [] },
  orchestratorClearBudget: { requires: ['project', 'state_db'], conditionalRequires: [] },
  orchestratorStatus: { requires: ['project', 'state_db'], conditionalRequires: [] },
  costs: { requires: ['state_db'], conditionalRequires: [] },
} as const satisfies Record<
  string,
  { requires: readonly ResourceName[]; conditionalRequires: readonly ResourceName[] }
>;

export type OperationId = keyof typeof COMMAND_RESOURCES;

/** The resources a command declares: the only ones its handler may `require`. */
export type Declared<Id extends OperationId> =
  (typeof COMMAND_RESOURCES)[Id]['requires' | 'conditionalRequires'][number];
