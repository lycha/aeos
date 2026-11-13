// GENERATED from cli-contract.yaml — do not edit
/* eslint-disable @typescript-eslint/no-empty-object-type */

export interface InstallArgs {
}

export interface InstallOptions {
  json?: boolean;
}

export type InstallData = { aeosHome: string; created: boolean };

export interface ProjectInitArgs {
}

export interface ProjectInitOptions {
  name?: string;
  key?: string;
  pipeline?: 'standard' | 'manifesto';
  json?: boolean;
}

export type ProjectInitData = { name: string; key: string; scaffolded: StringList };

export interface ProjectSyncArgs {
}

export interface ProjectSyncOptions {
  apply?: boolean;
  force?: boolean;
  diff?: boolean;
  json?: boolean;
}

export type ProjectSyncData = { missing: StringList; drifted: StringList; written: StringList };

export interface ProjectBoardArgs {
}

export interface ProjectBoardOptions {
  json?: boolean;
}

export type ProjectBoardData = { projects: Array<{ key: string; name: string; path: string; available: boolean; tickets: Array<{ id: TicketId; title: string; kind: Kind; parentId: NullableTicketId; column: Column; columnLabel: string; subState: SubState; needsHuman: boolean }> }> };

export interface TicketCreateArgs {
  title: string;
}

export interface TicketCreateOptions {
  parent?: string;
  key?: string;
  body?: string;
  bodyFile?: string;
  spec?: string;
  bug?: boolean;
  implements?: string[];
  json?: boolean;
}

export type TicketCreateData = { ticketId: TicketId; kind: Kind; parentId: NullableTicketId; alreadyExisted: boolean };

export interface TicketListArgs {
}

export interface TicketListOptions {
  column?: string;
  json?: boolean;
}

export type TicketListData = { tickets: Array<TicketSummary> };

export interface TicketShowArgs {
  id: string;
}

export interface TicketShowOptions {
  json?: boolean;
}

export type TicketShowData = { ticket: TicketDetail; artifacts: StringList; costUsd: Usd; children?: Array<TicketSummary>; runs?: Array<RunRecord>; gateRecords?: Array<GateRecord> };

export interface TicketAnswerArgs {
  id: string;
}

export interface TicketAnswerOptions {
  yes?: boolean;
  json?: boolean;
}

export type TicketAnswerData = { ticketId: TicketId; promoted: StringList; amendedDecisions: StringList; specPin: NullableSpecPin } | ConfirmationDeclined;

export interface TicketResolveArgs {
  id: string;
}

export interface TicketResolveOptions {
  yes?: boolean;
  json?: boolean;
}

export type TicketResolveData = SubStateChange | ConfirmationDeclined;

export interface TicketRunArgs {
  id: string;
}

export interface TicketRunOptions {
  executor?: 'claude-cli' | 'auggie-cli' | 'opencode-cli' | 'ollama-cli';
  model?: string;
  json?: boolean;
}

export type TicketRunData = TicketRunResult;

export interface TicketApproveArgs {
  id: string;
}

export interface TicketApproveOptions {
  contract?: boolean;
  json?: boolean;
}

export type TicketApproveData = { ticketId: TicketId; fromColumn: Column; toColumn: Column; pullRequestUrl: NullableString; gateRecordId: GateRecordId };

export interface TicketSignOffArgs {
  id: string;
}

export interface TicketSignOffOptions {
  reason: string;
  json?: boolean;
}

export type TicketSignOffData = { ticketId: TicketId; subState: SubState; gateRecordId: GateRecordId };

export interface TicketMoveArgs {
  id: string;
  status: string;
}

export interface TicketMoveOptions {
  reason: string;
  json?: boolean;
}

export type TicketMoveData = { ticketId: TicketId; fromColumn: Column; toColumn: Column; gateRecordId: GateRecordId };

export interface TicketReadyArgs {
  id: string;
}

export interface TicketReadyOptions {
  json?: boolean;
}

export type TicketReadyData = SubStateChange;

export interface TicketDodApproveArgs {
  id: string;
}

export interface TicketDodApproveOptions {
  reason?: string;
  verified?: string[];
  dryRun?: boolean;
  decision?: 'approve' | 'reject';
  reviewHash?: string;
  json?: boolean;
}

export type TicketDodApproveData = { ticketId: TicketId; approved: boolean; conformance: { pass: number; fail: number; unverified: number; total: number }; gateRecordId: GateRecordId } | { report: ConformanceReport | null; prUrl: NullableString; reviewHash: NullableString };

export interface TicketRepinArgs {
  id: string;
}

export interface TicketRepinOptions {
  json?: boolean;
}

export type TicketRepinData = { ticketId: TicketId; fromCommit: string; toCommit: string; gateRecordId: GateRecordId };

export interface OrchestratorRunArgs {
  epicId: string;
}

export interface OrchestratorRunOptions {
  budget?: number;
  maxSteps?: number;
  json?: boolean;
}

export type OrchestratorRunData = OrchestratorRunResult;

export interface OrchestratorPauseArgs {
  epicId: string;
}

export interface OrchestratorPauseOptions {
  json?: boolean;
}

export type OrchestratorPauseData = PauseState;

export interface OrchestratorResumeArgs {
  epicId: string;
}

export interface OrchestratorResumeOptions {
  json?: boolean;
}

export type OrchestratorResumeData = PauseState;

export interface OrchestratorClearBudgetArgs {
  epicId: string;
}

export interface OrchestratorClearBudgetOptions {
  json?: boolean;
}

export type OrchestratorClearBudgetData = { epicId: TicketId; budgetUsd: null };

export interface OrchestratorStatusArgs {
  epicId?: string;
}

export interface OrchestratorStatusOptions {
  json?: boolean;
}

export type OrchestratorStatusData = { epics: Array<EpicState> };

export interface CostsArgs {
}

export interface CostsOptions {
  project?: string;
  epic?: string;
  ticket?: string;
  since?: string;
  json?: boolean;
}

export type CostsData = { totalUsd: Usd; unknownRecords: number; byProject: Array<ProjectCost> };

export interface ServeArgs {
}

export interface ServeOptions {
  port?: number;
  noOpen?: boolean;
  json?: boolean;
}

export type ServeData = { port: number; url: string };

export type Envelope = { ok: boolean; command: string; exit: 0 | 1 | 2 | 3 | 4 | 130; contractVersion: number; data: unknown; error: Error | null; warnings: Array<Warning> };

export type Error = { code: string; message: string; resource: 'aeos_home' | 'project' | 'state_db' | 'git_repo' | 'executor' | 'python' | 'gh' | null };

export type Warning = { code: string; message: string };

export type TicketId = string;

export type NullableTicketId = TicketId | null;

export type Kind = 'EPIC' | 'TASK';

export type Column = string;

export type SubState = 'READY' | 'BLOCKED' | 'WORKING' | 'INTERRUPTED' | 'FAILED' | 'ESCALATED' | 'IN_REVIEW' | 'SIGNED_OFF' | null;

export type Usd = number | null;

export type GateRecordId = string;

export type RunId = string;

export type NullableString = string | null;

export type StringList = Array<string>;

export type SpecPin = { repo: string; commit: string; path: string };

export type NullableSpecPin = SpecPin | null;

export type Escalation = { reason: string; message: string; attempt?: number; artifactPath?: string };

export type HaltReason = 'COMPLETE' | 'HUMAN_GATE' | 'NEEDS_HUMAN' | 'FAILED' | 'BUDGET_EXCEEDED' | 'AWAITING_APPROVAL' | 'INTERRUPTED' | 'AWAITING_DECOMPOSITION' | 'COST_UNKNOWN';

export type TicketSummary = { id: TicketId; title: string; kind: Kind; parentId: NullableTicketId; column: Column; columnLabel: string; subState: SubState };

export type TicketDetail = { id: TicketId; title: string; kind: Kind; parentId: NullableTicketId; column: Column; columnLabel: string; subState: SubState; escalation: Escalation | null; specPin: NullableSpecPin; pullRequestUrl: NullableString; contractChange: ContractChange | null; specMoved?: boolean; gitIdentity?: NullableString; availableActions?: Array<AvailableActionId>; availableColumns?: Array<{ id: Column; label: string }> };

export type ContractChange = { paths: StringList; approvedBy: GateRecordId | null };

export type SubStateChange = { ticketId: TicketId; subState: SubState };

export type ConfirmationDeclined = { ticketId: TicketId; declined: true };

export type TicketRunResult = { ticketId: TicketId; column: Column; subState: SubState; attempts: number; artifactPath: NullableString; reviewPath: NullableString; runIds: Array<RunId>; costUsd: Usd; escalation: Escalation | null };

export type OrchestratorRunResult = { epicId: TicketId; haltReason: HaltReason; message: string; steps: number; spentUsd: Usd };

export type PauseState = { epicId: TicketId; paused: boolean };

export type EpicState = { epicId: TicketId; status: string; haltReason: HaltReason | null; message: string | null; paused: boolean; budgetUsd: number | null; spentUsd: Usd };

export type CostBreakdown = Record<string, Usd>;

export type TicketCost = { ticketId: TicketId; totalUsd: Usd; byColumn: CostBreakdown; byRole: CostBreakdown };

export type ProjectCost = { projectId: string; totalUsd: Usd; byTicket: Array<TicketCost> };

export type AvailableActionId = 'ticketAnswer' | 'ticketResolve' | 'ticketApprove' | 'ticketDodApprove' | 'ticketSignOff' | 'ticketReady' | 'ticketRepin' | 'ticketMove';

export type RunRecord = { schema_version: 0; run_id: RunId; project: string; ticket: string; column: Column; role: 'preflight' | 'worker' | 'checks' | 'reviewer' | 'generator'; agent?: NullableString; attempt: number; executor: string; model?: NullableString; mode?: 'artifact' | 'agentic' | null; brief?: { path: string; sha256: string } | null; output?: NullableString; transcript?: NullableString; verdict?: 'APPROVED' | 'APPROVED_WITH_WARNINGS' | 'REJECTED' | 'UNPARSEABLE' | 'CHECKS_PASSED' | 'CHECKS_FAILED' | null; started_at: string; ended_at: string; duration_ms: number; exit: 'ok' | 'failed' | 'interrupted' | 'timeout'; usage?: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } | null; cost_usd: Usd; cost_basis: 'executor-estimate' | 'computed' | 'none' | 'unknown'; spec_pin?: NullableSpecPin; error?: NullableString };

export type GateRecord = { id: GateRecordId; gate: 'spec' | 'contract' | 'column-approval' | 'definition-of-done' | 'sign-off-override' | 'move-override' | 'answer' | 'escalation-resolution' | 'amendment' | 'repin' | 'pipeline-change'; ticket: string; column?: NullableString; from_column?: NullableString; to_column?: NullableString; decided_by: string; decided_at: string; verdict: 'approved' | 'rejected' | 'overridden'; reason?: string; overrides?: NullableString; evidence?: Array<SpecPin>; spec_pin?: NullableSpecPin };

export type ConformanceReport = { schema_version: 0; meta: { feature: string; epic: string; spec: SpecPin; code: { repo: string; commit: string; base?: string }; generated_at: string }; criteria: Array<{ id: string; verdict: 'pass' | 'fail' | 'unverified'; claimed_by?: StringList; instruments: Array<{ kind: 'test' | 'scenario' | 'check' | 'agent' | 'human'; name: string; result: 'pass' | 'fail'; evidence?: string }>; notes?: string }>; non_goals?: Array<string>; summary: { total: number; pass: number; fail: number; unverified: number } };
