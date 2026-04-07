// CLI — Composition root / dependency injection wiring
//
// Wiring pattern:
//   1. Create infrastructure adapters (DB connection, FS adapters, Git gateway)
//   2. Inject adapters into use cases via constructor
//   3. Return a container object mapping use case names → instances
//   4. CLI commands receive the container and call use cases
//
// Example:
//   export function createContainer() {
//     const db = getDb();
//     const ticketRepo = new SqliteTicketRepository(db);
//     const transitionRepo = new SqliteTransitionRepository(db);
//     const costRepo = new SqliteCostRepository(db);
//     const artifactStore = new FsArtifactStore();
//     const gitGateway = new SimpleGitGateway();
//     const configStore = new FsConfigStore();
//     const projectRepo = new FsProjectRepository();
//     const stateMachine = new StateMachineService(ticketRepo, transitionRepo);
//
//     return {
//       install: new InstallUseCase(configStore, gitGateway),
//       projectInit: new ProjectInitUseCase(projectRepo, configStore),
//       ticketCreate: new TicketCreateUseCase(ticketRepo, artifactStore, gitGateway, projectRepo),
//       ticketList: new TicketListUseCase(ticketRepo, projectRepo),
//       ticketShow: new TicketShowUseCase(ticketRepo, artifactStore, projectRepo),
//       ticketRun: new TicketRunUseCase(ticketRepo, stateMachine, artifactStore, gitGateway, executor),
//       ticketApprove: new TicketApproveUseCase(ticketRepo, stateMachine, projectRepo),
//       ticketAnswer: new TicketAnswerUseCase(ticketRepo, stateMachine, artifactStore, projectRepo),
//       dashboard: new DashboardUseCase(ticketRepo, configStore),
//       costs: new CostsUseCase(costRepo),
//     };
//   }
