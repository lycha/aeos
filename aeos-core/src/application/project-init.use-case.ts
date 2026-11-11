// Use case — ProjectInit (per-project setup)

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import type { ProjectRepository } from '../domain/ports/driven/project-repository.port.js';
import type { ConfigStore } from '../domain/ports/driven/config-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type {
  ProjectInitPort,
  ProjectInitInput,
  ProjectInitResult,
} from '../domain/ports/driving/project-init.port.js';
import type { Project } from '../domain/model/project.js';

export class ProjectInitUseCase implements ProjectInitPort {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly configStore: ConfigStore,
    private readonly gitGateway: GitGateway,
  ) {}

  execute(input: ProjectInitInput): ProjectInitResult {
    const { name, key, cwd } = input;

    // Derive slug id from name
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const now = new Date().toISOString();

    // If already initialised, return existing project info (idempotent).
    // Re-running is also the repair path: anything missing is restored,
    // anything present is left exactly as the user edited it.
    if (this.projectRepo.exists(cwd)) {
      const existing = this.projectRepo.read(cwd);
      this.ensureRegistered(existing, cwd);
      const restored = this.projectRepo.scaffoldDefaults(cwd);
      this.projectRepo.writeConstraintsPlaceholder(cwd);
      this.commitScaffold(path.join(cwd, '.aeos'), existing.key);
      return { name: existing.name, key: existing.key, scaffolded: restored };
    }

    const uuid = crypto.randomUUID();

    const project: Project = {
      uuid,
      id,
      name,
      key,
      path: cwd,
      created_at: now,
    };

    // 1. Create .aeos/ and write project.json
    this.projectRepo.writeProject(project);

    // 2. Init git repo in .aeos/
    const aeosDir = path.join(cwd, '.aeos');
    this.gitGateway.init(aeosDir);

    // 3. Scaffold the default column specs, agents, and rubrics. Without these
    //    the project has no pipeline to run — `ticket run` fails immediately
    //    with a missing column spec.
    const scaffolded = this.projectRepo.scaffoldDefaults(cwd);

    // 4. Write CONSTRAINTS.md placeholder
    this.projectRepo.writeConstraintsPlaceholder(cwd);

    // 5. Register in global registry
    this.ensureRegistered(project, cwd);

    // 6. Commit the scaffold
    this.commitScaffold(aeosDir, key);

    return { name, key, scaffolded };
  }

  /**
   * Commits whatever is uncommitted in `.aeos`. The protected-path and contract
   * checks compare the changed files before and after a run, so a scaffolded
   * file that was never committed would not be guarded. Like `ticket create`,
   * this takes everything in the tree, a person's uncommitted edit included.
   */
  private commitScaffold(aeosDir: string, key: string): void {
    if (this.gitGateway.changedFiles(aeosDir).length === 0) return;
    this.gitGateway.commit(aeosDir, `[${key}][INIT] scaffold`);
    // The gateway does not say when git refuses; what is still uncommitted does.
    if (this.gitGateway.changedFiles(aeosDir).length > 0) {
      throw new Error(
        `The scaffold in ${aeosDir} could not be committed. If git has no identity there, set one: git config user.name "Your Name" && git config user.email you@example.com. Then run \`aeos project init\` again.`,
      );
    }
  }

  private ensureRegistered(project: Project, cwd: string): void {
    const entries = this.configStore.readRegistry();
    const existing = entries.find((e) => e.path === cwd);
    if (existing) return;

    entries.push({
      uuid: project.uuid,
      id: project.id,
      name: project.name,
      key: project.key,
      path: cwd,
      aeos_path: path.join(cwd, '.aeos'),
      created_at: project.created_at,
    });

    this.configStore.writeRegistry(entries);
  }
}
