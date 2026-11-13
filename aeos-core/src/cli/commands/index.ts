// CLI commands — one handler per command of the contract, by operationId

import type { Handlers } from '../generated/commands.gen.js';
import { costs } from './costs.handler.js';
import { install } from './install.handler.js';
import {
  orchestratorClearBudget,
  orchestratorPause,
  orchestratorResume,
  orchestratorRun,
  orchestratorStatus,
} from './orchestrator.handler.js';
import { projectBoard } from './project-board.handler.js';
import { projectInit } from './project-init.handler.js';
import { projectSync } from './project-sync.handler.js';
import { serve } from './serve.handler.js';
import { ticketAnswer } from './ticket-answer.handler.js';
import { ticketApprove } from './ticket-approve.handler.js';
import { ticketCreate } from './ticket-create.handler.js';
import { ticketDodApprove } from './ticket-dod-approve.handler.js';
import { ticketList } from './ticket-list.handler.js';
import { ticketMove } from './ticket-move.handler.js';
import { ticketReady } from './ticket-ready.handler.js';
import { ticketRepin } from './ticket-repin.handler.js';
import { ticketResolve } from './ticket-resolve.handler.js';
import { ticketRun } from './ticket-run.handler.js';
import { ticketShow } from './ticket-show.handler.js';
import { ticketSignOff } from './ticket-sign-off.handler.js';

export const handlers: Handlers = {
  install,
  projectBoard,
  projectInit,
  projectSync,
  ticketCreate,
  ticketList,
  ticketShow,
  ticketAnswer,
  ticketResolve,
  ticketRun,
  ticketApprove,
  ticketSignOff,
  ticketMove,
  ticketReady,
  ticketDodApprove,
  ticketRepin,
  orchestratorRun,
  orchestratorPause,
  orchestratorResume,
  orchestratorClearBudget,
  orchestratorStatus,
  costs,
  serve,
};
