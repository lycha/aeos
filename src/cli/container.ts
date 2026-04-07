// CLI — Composition root / dependency injection wiring

import type { InstallPort } from '../domain/ports/driving/install.port.js';
import type { ProjectInitPort } from '../domain/ports/driving/project-init.port.js';
import type { TicketCreatePort } from '../domain/ports/driving/ticket-create.port.js';
import type { TicketListPort } from '../domain/ports/driving/ticket-list.port.js';
import type { TicketShowPort } from '../domain/ports/driving/ticket-show.port.js';
import type { ProjectRepository } from '../domain/ports/driven/project-repository.port.js';
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

export interface Container {
  install: InstallPort;
  projectInit: ProjectInitPort;
  ticketCreate: TicketCreatePort;
  ticketList: TicketListPort;
  ticketShow: TicketShowPort;
  projectRepo: ProjectRepository;
}

export function createContainer(): Container {
  const configStore = new FsConfigStore();
  const projectRepo = new FsProjectRepository();
  const gitGateway = new SimpleGitGateway();
  const artifactStore = new FsArtifactStore();

  // Lazy DB + ticket repo — only resolved when a command that needs the DB runs.
  // `install` and `project-init` do NOT need the DB (they create ~/.aeos/ first).
  let ticketRepo: SqliteTicketRepository | null = null;
  const getTicketRepo = (): SqliteTicketRepository => {
    if (!ticketRepo) {
      ticketRepo = new SqliteTicketRepository(getDb());
    }
    return ticketRepo;
  };

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
    projectRepo,
  };
}
