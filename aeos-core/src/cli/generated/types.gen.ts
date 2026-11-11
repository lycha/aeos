// GENERATED from cli-contract.yaml — do not edit
/* eslint-disable @typescript-eslint/no-empty-object-type */

export interface InstallArgs {
}

export interface InstallOptions {
}

export interface ProjectInitArgs {
}

export interface ProjectInitOptions {
  name?: string;
  key?: string;
}

export interface ProjectSyncArgs {
}

export interface ProjectSyncOptions {
  apply?: boolean;
  force?: boolean;
  diff?: boolean;
}

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
}

export interface TicketListArgs {
}

export interface TicketListOptions {
  column?: string;
}

export interface TicketShowArgs {
  id: string;
}

export interface TicketShowOptions {
}

export interface TicketAnswerArgs {
  id: string;
}

export interface TicketAnswerOptions {
}

export interface TicketResolveArgs {
  id: string;
}

export interface TicketResolveOptions {
}

export interface TicketRunArgs {
  id: string;
}

export interface TicketRunOptions {
  executor?: 'claude-cli' | 'auggie-cli' | 'opencode-cli' | 'ollama-cli';
  model?: string;
}

export interface TicketApproveArgs {
  id: string;
}

export interface TicketApproveOptions {
}

export interface TicketSignOffArgs {
  id: string;
}

export interface TicketSignOffOptions {
  reason: string;
}

export interface TicketMoveArgs {
  id: string;
  status: string;
}

export interface TicketMoveOptions {
  reason: string;
}

export interface TicketReadyArgs {
  id: string;
}

export interface TicketReadyOptions {
}

export interface TicketDodApproveArgs {
  id: string;
}

export interface TicketDodApproveOptions {
  reason?: string;
  verified?: string[];
}

export interface TicketRepinArgs {
  id: string;
}

export interface TicketRepinOptions {
}

export interface OrchestratorRunArgs {
  epicId: string;
}

export interface OrchestratorRunOptions {
  budget?: number;
  maxSteps?: number;
}

export interface OrchestratorPauseArgs {
  epicId: string;
}

export interface OrchestratorPauseOptions {
}

export interface OrchestratorResumeArgs {
  epicId: string;
}

export interface OrchestratorResumeOptions {
}

export interface OrchestratorClearBudgetArgs {
  epicId: string;
}

export interface OrchestratorClearBudgetOptions {
}

export interface OrchestratorStatusArgs {
  epicId?: string;
}

export interface OrchestratorStatusOptions {
}

export interface CostsArgs {
}

export interface CostsOptions {
  project?: string;
  epic?: string;
  ticket?: string;
  since?: string;
}
