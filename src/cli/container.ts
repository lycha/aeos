// CLI — Composition root / dependency injection wiring

import type { InstallPort } from '../domain/ports/driving/install.port.js';
import type { ProjectInitPort } from '../domain/ports/driving/project-init.port.js';
import type { TicketCreatePort } from '../domain/ports/driving/ticket-create.port.js';
import type { TicketListPort } from '../domain/ports/driving/ticket-list.port.js';
import type { TicketShowPort } from '../domain/ports/driving/ticket-show.port.js';
import type { TicketAnswerPort } from '../domain/ports/driving/ticket-answer.port.js';
import type { TicketRunPort } from '../domain/ports/driving/ticket-run.port.js';
import type { TicketApprovePort } from '../domain/ports/driving/ticket-approve.port.js';
import type { TicketDodApprovePort } from '../domain/ports/driving/ticket-dod-approve.port.js';
import type { ProjectRepository } from '../domain/ports/driven/project-repository.port.js';
import type { RubricLoader } from '../domain/ports/driven/rubric-loader.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import { FsConfigStore } from '../infrastructure/filesystem/fs-config.adapter.js';
import { FsProjectRepository } from '../infrastructure/filesystem/fs-project.repository.js';
import { FsArtifactStore } from '../infrastructure/filesystem/fs-artifact-store.adapter.js';
import { SimpleGitGateway } from '../infrastructure/git/simple-git-gateway.adapter.js';
import { SqliteTicketRepository } from '../infrastructure/persistence/sqlite-ticket.repository.js';
import { getDb } from '../infrastructure/persistence/database.js';
import { InstallUseCase } from '../application/install.use-case.js';
import { ProjectInitUseCase } from '../application/project-init.use-case.js';
import { TicketCreateUseCase } from '../application/ticket-create.use-case.js';
import { TicketListUseCase } from '../application/ticket-list.use-case.js';
import { TicketShowUseCase } from '../application/ticket-show.use-case.js';
import { TicketAnswerUseCase } from '../application/ticket-answer.use-case.js';
import { TicketRunUseCase } from '../application/ticket-run.use-case.js';
import { TicketApproveUseCase } from '../application/ticket-approve.use-case.js';
import { TicketDodApproveUseCase } from '../application/ticket-dod-approve.use-case.js';
import { StateMachineService } from '../domain/services/state-machine.js';
import { SqliteTransitionRepository } from '../infrastructure/persistence/sqlite-transition.repository.js';
import { ContextAssembler } from '../application/services/context-assembler.js';
import { buildPrompt } from '../application/services/prompt-builder.js';
import { StubExecutor } from '../infrastructure/executor/stub-executor.adapter.js';
import { ClaudeCodeCliExecutor } from '../infrastructure/executor/claude-cli-executor.adapter.js';
import { YamlColumnSpecLoader } from '../infrastructure/spec-loader/yaml-column-spec-loader.adapter.js';
import { YamlAgentSpecLoader } from '../infrastructure/spec-loader/yaml-agent-spec-loader.adapter.js';
import { FsRubricLoader } from '../infrastructure/filesystem/fs-rubric-loader.adapter.js';
import { PreflightService } from '../application/services/preflight.js';
import { SqliteCostRepository } from '../infrastructure/persistence/sqlite-cost.repository.js';

export interface Container {
  install: InstallPort;
  projectInit: ProjectInitPort;
  ticketCreate: TicketCreatePort;
  ticketList: TicketListPort;
  ticketShow: TicketShowPort;
  ticketAnswer: TicketAnswerPort;
  ticketRun: TicketRunPort;
  ticketApprove: TicketApprovePort;
  ticketDodApprove: TicketDodApprovePort;
  projectRepo: ProjectRepository;
  rubricLoader: RubricLoader;
  artifactStore: ArtifactStore;
}

export function createContainer(): Container {
  const configStore = new FsConfigStore();
  const projectRepo = new FsProjectRepository();
  const gitGateway = new SimpleGitGateway();
  const artifactStore = new FsArtifactStore();

  // Lazy singletons — only resolved when a command that needs the DB runs.
  // `install` and `project-init` do NOT need the DB (they create ~/.aeos/ first).
  let ticketRepo: SqliteTicketRepository | null = null;
  const getTicketRepo = (): SqliteTicketRepository =>
    (ticketRepo ??= new SqliteTicketRepository(getDb()));

  let transitionRepo: SqliteTransitionRepository | null = null;
  const getTransitionRepo = (): SqliteTransitionRepository =>
    (transitionRepo ??= new SqliteTransitionRepository(getDb()));

  let costRepo: SqliteCostRepository | null = null;
  const getCostRepo = (): SqliteCostRepository => (costRepo ??= new SqliteCostRepository(getDb()));

  let stateMachine: StateMachineService | null = null;
  const getStateMachine = (): StateMachineService =>
    (stateMachine ??= new StateMachineService(getTicketRepo(), getTransitionRepo()));

  // Executor selection: AEOS_EXECUTOR=stub for testing, otherwise real Claude CLI
  const createExecutor = () =>
    process.env.AEOS_EXECUTOR === 'stub' ? new StubExecutor() : new ClaudeCodeCliExecutor();

  return {
    install: new InstallUseCase(configStore),
    projectInit: new ProjectInitUseCase(projectRepo, configStore, gitGateway),
    get ticketCreate() {
      return new TicketCreateUseCase(getTicketRepo(), artifactStore, gitGateway);
    },
    get ticketList() {
      return new TicketListUseCase(getTicketRepo());
    },
    get ticketShow() {
      return new TicketShowUseCase(getTicketRepo(), artifactStore);
    },
    get ticketAnswer() {
      return new TicketAnswerUseCase(getTicketRepo(), artifactStore, getStateMachine(), gitGateway);
    },
    get ticketRun() {
      const executor = createExecutor();
      const contextAssembler = new ContextAssembler(artifactStore, projectRepo, gitGateway);
      const columnSpecLoader = new YamlColumnSpecLoader();
      const agentSpecLoader = new YamlAgentSpecLoader();
      const rubricLoader = new FsRubricLoader();
      const preflight = new PreflightService(executor, artifactStore, getStateMachine());
      return new TicketRunUseCase(
        getTicketRepo(),
        getStateMachine(),
        contextAssembler,
        buildPrompt,
        executor,
        artifactStore,
        gitGateway,
        columnSpecLoader,
        agentSpecLoader,
        rubricLoader,
        preflight,
        getCostRepo(),
      );
    },
    get ticketApprove() {
      return new TicketApproveUseCase(getTicketRepo(), getStateMachine(), gitGateway);
    },
    get ticketDodApprove() {
      return new TicketDodApproveUseCase(
        getTicketRepo(),
        getStateMachine(),
        gitGateway,
        getCostRepo(),
      );
    },
    projectRepo,
    rubricLoader: new FsRubricLoader(),
    artifactStore,
  };
}
