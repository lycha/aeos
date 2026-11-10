// CLI — Composition root / dependency injection wiring

import type { InstallPort } from '../domain/ports/driving/install.port.js';
import type { ProjectInitPort } from '../domain/ports/driving/project-init.port.js';
import type { ProjectSyncPort } from '../domain/ports/driving/project-sync.port.js';
import type { TicketCreatePort } from '../domain/ports/driving/ticket-create.port.js';
import type { TicketListPort } from '../domain/ports/driving/ticket-list.port.js';
import type { TicketShowPort } from '../domain/ports/driving/ticket-show.port.js';
import type { TicketAnswerPort } from '../domain/ports/driving/ticket-answer.port.js';
import type { TicketRepinPort } from '../domain/ports/driving/ticket-repin.port.js';
import type { TicketResolvePort } from '../domain/ports/driving/ticket-resolve.port.js';
import type { TicketRunPort } from '../domain/ports/driving/ticket-run.port.js';
import type { TicketApprovePort } from '../domain/ports/driving/ticket-approve.port.js';
import type { TicketSignOffPort } from '../domain/ports/driving/ticket-sign-off.port.js';
import type { TicketMovePort } from '../domain/ports/driving/ticket-move.port.js';
import type { TicketReadyPort } from '../domain/ports/driving/ticket-ready.port.js';
import type { TicketDodApprovePort } from '../domain/ports/driving/ticket-dod-approve.port.js';
import type { OrchestratorPort } from '../domain/ports/driving/orchestrator.port.js';
import type { CostsPort } from '../domain/ports/driving/costs.port.js';
import { CostsUseCase } from '../application/costs.use-case.js';
import { OrchestratorUseCase } from '../application/orchestrator.use-case.js';
import { SqliteOrchestratorStateRepository } from '../infrastructure/persistence/sqlite-orchestrator-state.repository.js';
import type { ProjectRepository } from '../domain/ports/driven/project-repository.port.js';
import type { RubricLoader } from '../domain/ports/driven/rubric-loader.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import { FsConfigStore } from '../infrastructure/filesystem/fs-config.adapter.js';
import { FsProjectRepository } from '../infrastructure/filesystem/fs-project.repository.js';
import { FsArtefactTree } from '../infrastructure/filesystem/fs-artefact-tree.adapter.js';
import { PythonDecisionsLint } from '../infrastructure/spec/decisions-lint.adapter.js';
import { FsArtifactStore } from '../infrastructure/filesystem/fs-artifact-store.adapter.js';
import { FsRunRecordStore } from '../infrastructure/filesystem/fs-run-record-store.adapter.js';
import { FsGateRecordStore } from '../infrastructure/filesystem/fs-gate-record-store.adapter.js';
import { GateRecorder } from '../application/services/gate-recorder.js';
import { SimpleGitGateway } from '../infrastructure/git/simple-git-gateway.adapter.js';
import { SqliteTicketRepository } from '../infrastructure/persistence/sqlite-ticket.repository.js';
import { getDb } from '../infrastructure/persistence/database.js';
import { InstallUseCase } from '../application/install.use-case.js';
import { ProjectInitUseCase } from '../application/project-init.use-case.js';
import { ProjectSyncUseCase } from '../application/project-sync.use-case.js';
import { FsTemplateCatalog } from '../infrastructure/filesystem/fs-template-catalog.js';
import { TicketCreateUseCase } from '../application/ticket-create.use-case.js';
import { TicketListUseCase } from '../application/ticket-list.use-case.js';
import { TicketShowUseCase } from '../application/ticket-show.use-case.js';
import { TicketAnswerUseCase } from '../application/ticket-answer.use-case.js';
import { TicketRepinUseCase } from '../application/ticket-repin.use-case.js';
import { SpecAmendmentService } from '../application/services/spec-amendment.service.js';
import { YamlDecisionsFile } from '../infrastructure/spec/decisions-file.adapter.js';
import { TicketResolveUseCase } from '../application/ticket-resolve.use-case.js';
import { TicketRunUseCase } from '../application/ticket-run.use-case.js';
import { CheckRegistry } from '../application/checks/check-registry.js';
import { CriteriaCollector } from '../application/services/criteria-collector.js';
import { ShellChecksRunner } from '../infrastructure/checks/shell-checks-runner.adapter.js';
import { TicketApproveUseCase } from '../application/ticket-approve.use-case.js';
import { TicketSignOffUseCase } from '../application/ticket-sign-off.use-case.js';
import { TicketMoveUseCase } from '../application/ticket-move.use-case.js';
import { TicketReadyUseCase } from '../application/ticket-ready.use-case.js';
import { TicketDodApproveUseCase } from '../application/ticket-dod-approve.use-case.js';
import { StateMachineService } from '../domain/services/state-machine.js';
import { SqliteTransitionRepository } from '../infrastructure/persistence/sqlite-transition.repository.js';
import { ContextAssembler } from '../application/services/context-assembler.js';
import { buildPrompt } from '../application/services/prompt-builder.js';
import { StubExecutor } from '../infrastructure/executor/stub-executor.adapter.js';
import { ClaudeCodeCliExecutor } from '../infrastructure/executor/claude-cli-executor.adapter.js';
import { AuggieCliExecutor } from '../infrastructure/executor/auggie-cli-executor.adapter.js';
import { OpenCodeCliExecutor } from '../infrastructure/executor/opencode-cli-executor.adapter.js';
import { OllamaCliExecutor } from '../infrastructure/executor/ollama-cli-executor.adapter.js';
import { YamlColumnSpecLoader } from '../infrastructure/spec-loader/yaml-column-spec-loader.adapter.js';
import { YamlAgentSpecLoader } from '../infrastructure/spec-loader/yaml-agent-spec-loader.adapter.js';
import { FsRubricLoader } from '../infrastructure/filesystem/fs-rubric-loader.adapter.js';
import { PreflightService } from '../application/services/preflight.js';
import { SqliteCostRepository } from '../infrastructure/persistence/sqlite-cost.repository.js';
import { DecisionPromotionService } from '../application/services/decision-promotion.service.js';
import { ExecutorConfigResolver } from '../application/services/executor-config-resolver.js';
import { GhPullRequestGateway } from '../infrastructure/pull-request/gh-pull-request.adapter.js';
import { StubPullRequestGateway } from '../infrastructure/pull-request/stub-pull-request.adapter.js';
import type { AgentSpec } from '../domain/model/agent-spec.js';
import { columnLabels, type ColumnLabels } from '../domain/services/column-labels.js';

export interface Container {
  install: InstallPort;
  projectInit: ProjectInitPort;
  projectSync: ProjectSyncPort;
  ticketCreate: TicketCreatePort;
  ticketList: TicketListPort;
  ticketShow: TicketShowPort;
  ticketAnswer: TicketAnswerPort;
  ticketRepin: TicketRepinPort;
  ticketResolve: TicketResolvePort;
  ticketRun: TicketRunPort;
  ticketApprove: TicketApprovePort;
  ticketSignOff: TicketSignOffPort;
  ticketMove: TicketMovePort;
  ticketReady: TicketReadyPort;
  ticketDodApprove: TicketDodApprovePort;
  orchestrator: OrchestratorPort;
  costs: CostsPort;
  projectRepo: ProjectRepository;
  /** The label of every column of the project at this path. Throws when they are invalid. */
  columnLabels: (projectPath: string) => ColumnLabels;
  /** The same by project id, for `aeos costs`; the defaults for a project that cannot be read. */
  columnLabelsOfProject: (projectId: string) => ColumnLabels;
  rubricLoader: RubricLoader;
  artifactStore: ArtifactStore;
}

export function createContainer(): Container {
  const configStore = new FsConfigStore();
  const projectRepo = new FsProjectRepository();
  const artefactTree = new FsArtefactTree();
  const gitGateway = new SimpleGitGateway();
  const artifactStore = new FsArtifactStore();
  const runRecordStore = new FsRunRecordStore();

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

  let orchestratorStateRepo: SqliteOrchestratorStateRepository | null = null;
  const getOrchestratorStateRepo = (): SqliteOrchestratorStateRepository =>
    (orchestratorStateRepo ??= new SqliteOrchestratorStateRepository(getDb()));

  const gateRecordStore = new FsGateRecordStore(artefactTree, gitGateway);
  const getGateRecorder = (): GateRecorder =>
    new GateRecorder(gateRecordStore, gitGateway, getTicketRepo(), runRecordStore);

  let stateMachine: StateMachineService | null = null;
  const getStateMachine = (): StateMachineService =>
    (stateMachine ??= new StateMachineService(getTicketRepo(), getTransitionRepo()));

  // AEOS_EXECUTOR=stub is read here and handed to the resolver, which turns
  // every agent's executor into `stub` before createExecutor sees it.
  const newExecutorConfigResolver = (): ExecutorConfigResolver =>
    new ExecutorConfigResolver(projectRepo, process.env.AEOS_EXECUTOR === 'stub');

  const createExecutor = (agentSpec: AgentSpec) => {
    if (agentSpec.executor.type === 'stub') {
      return new StubExecutor();
    }

    switch (agentSpec.executor.type) {
      case 'claude-cli':
        return new ClaudeCodeCliExecutor({
          model: agentSpec.executor.model,
          timeoutMs: agentSpec.executor.timeoutSeconds * 1000,
        });
      case 'auggie-cli':
        return new AuggieCliExecutor({
          model: agentSpec.executor.model,
          timeoutMs: agentSpec.executor.timeoutSeconds * 1000,
        });
      case 'opencode-cli':
        return new OpenCodeCliExecutor({
          model: agentSpec.executor.model,
          timeoutMs: agentSpec.executor.timeoutSeconds * 1000,
        });
      case 'ollama-cli':
        return new OllamaCliExecutor({
          model: agentSpec.executor.model,
          timeoutMs: agentSpec.executor.timeoutSeconds * 1000,
        });
      default:
        throw new Error(`Unsupported executor type: ${agentSpec.executor.type}`);
    }
  };

  return {
    install: new InstallUseCase(configStore),
    projectInit: new ProjectInitUseCase(projectRepo, configStore, gitGateway),
    projectSync: new ProjectSyncUseCase(new FsTemplateCatalog()),
    get ticketCreate() {
      return new TicketCreateUseCase(
        getTicketRepo(),
        artifactStore,
        gitGateway,
        artefactTree,
        new PythonDecisionsLint(),
      );
    },
    get ticketList() {
      return new TicketListUseCase(getTicketRepo());
    },
    get ticketShow() {
      return new TicketShowUseCase(
        getTicketRepo(),
        artifactStore,
        getCostRepo(),
        runRecordStore,
        gitGateway,
        artefactTree,
      );
    },
    get ticketAnswer() {
      return new TicketAnswerUseCase(
        getTicketRepo(),
        artifactStore,
        getStateMachine(),
        gitGateway,
        new DecisionPromotionService(artifactStore),
        getGateRecorder(),
        new SpecAmendmentService(
          artefactTree,
          new YamlDecisionsFile(),
          new PythonDecisionsLint(),
          gitGateway,
          gateRecordStore,
        ),
      );
    },
    get ticketRepin() {
      return new TicketRepinUseCase(
        getTicketRepo(),
        artifactStore,
        getStateMachine(),
        gitGateway,
        artefactTree,
        new PythonDecisionsLint(),
        getGateRecorder(),
      );
    },
    get ticketResolve() {
      return new TicketResolveUseCase(
        getTicketRepo(),
        artifactStore,
        getStateMachine(),
        gitGateway,
        getGateRecorder(),
      );
    },
    get ticketRun() {
      const contextAssembler = new ContextAssembler(
        artifactStore,
        projectRepo,
        gitGateway,
        artefactTree,
      );
      const columnSpecLoader = new YamlColumnSpecLoader();
      const agentSpecLoader = new YamlAgentSpecLoader();
      const rubricLoader = new FsRubricLoader();
      const preflight = new PreflightService(artifactStore, getStateMachine());
      const executorConfigResolver = newExecutorConfigResolver();
      const criteriaCollector = new CriteriaCollector(
        getTicketRepo(),
        gitGateway,
        artefactTree,
        projectRepo,
      );
      return new TicketRunUseCase(
        getTicketRepo(),
        getStateMachine(),
        contextAssembler,
        buildPrompt,
        createExecutor,
        artifactStore,
        gitGateway,
        columnSpecLoader,
        agentSpecLoader,
        rubricLoader,
        preflight,
        getCostRepo(),
        executorConfigResolver,
        configStore,
        runRecordStore,
        new CheckRegistry(projectRepo, new ShellChecksRunner(), criteriaCollector, artifactStore),
        projectRepo,
        gateRecordStore,
        criteriaCollector,
      );
    },
    get ticketApprove() {
      return new TicketApproveUseCase(
        getTicketRepo(),
        artifactStore,
        getStateMachine(),
        gitGateway,
        // A stub run must never reach the real code host.
        process.env.AEOS_EXECUTOR === 'stub'
          ? new StubPullRequestGateway()
          : new GhPullRequestGateway(),
        getCostRepo(),
        new YamlColumnSpecLoader(),
        projectRepo,
        getGateRecorder(),
      );
    },
    get ticketSignOff() {
      return new TicketSignOffUseCase(
        getTicketRepo(),
        artifactStore,
        getStateMachine(),
        getGateRecorder(),
      );
    },
    get ticketMove() {
      return new TicketMoveUseCase(
        getTicketRepo(),
        artifactStore,
        getStateMachine(),
        gitGateway,
        getGateRecorder(),
      );
    },
    get ticketReady() {
      return new TicketReadyUseCase(getTicketRepo(), artifactStore, getStateMachine());
    },
    get orchestrator() {
      return new OrchestratorUseCase(
        getTicketRepo(),
        getCostRepo(),
        getOrchestratorStateRepo(),
        new YamlColumnSpecLoader(),
        configStore,
        this.ticketRun,
        this.ticketApprove,
        gitGateway,
        new YamlAgentSpecLoader(),
        newExecutorConfigResolver(),
      );
    },
    get ticketDodApprove() {
      return new TicketDodApproveUseCase(
        getTicketRepo(),
        artifactStore,
        getStateMachine(),
        gitGateway,
        getCostRepo(),
        getGateRecorder(),
      );
    },
    get costs() {
      return new CostsUseCase(getCostRepo(), configStore);
    },
    projectRepo,
    columnLabels: (projectPath) => new YamlColumnSpecLoader().labels(projectPath),
    columnLabelsOfProject: (projectId) => {
      try {
        const entry = configStore.readRegistry().find((project) => project.id === projectId);
        if (entry) return new YamlColumnSpecLoader().labels(entry.path);
      } catch {
        // A report across projects must not fail on one project's labels.
      }
      return columnLabels({}, null);
    },
    rubricLoader: new FsRubricLoader(),
    artifactStore,
  };
}
