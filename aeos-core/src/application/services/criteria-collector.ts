// Application service — CriteriaCollector: gathers what criterion tracing
// compares. The spec is read at its pin and the tests at the project's HEAD,
// both through git, so the trace is of what is committed.

import type { SpecPin } from '../../domain/model/spec-pin.js';
import type { Ticket } from '../../domain/model/ticket.js';
import type { ArtefactTree } from '../../domain/ports/driven/artefact-tree.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';
import {
  parseCriteria,
  parseFeature,
  testTags,
  traceCriteria,
  type CriteriaTrace,
} from '../../domain/services/criteria-trace.js';
import { findViolations } from '../../domain/services/path-guard.js';

export const DEFAULT_TEST_GLOBS: readonly string[] = [
  'src/**/*.test.ts',
  'src/**/*.test.tsx',
  'tests/**/*',
];

export class CriteriaCollector {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly gitGateway: GitGateway,
    private readonly artefactTree: ArtefactTree,
    private readonly projectRepo: ProjectRepository,
  ) {}

  /** The trace of `epic`'s pinned criteria against its tasks' claims and the tagged instruments. */
  collect(
    projectPath: string,
    epic: Pick<Ticket, 'id' | 'projectId'>,
    pin: SpecPin,
  ): CriteriaTrace {
    const treeRoot = this.artefactTree.root(projectPath);
    const instruments = new Map<string, string[]>();
    const add = (id: string, name: string): void => {
      const names = instruments.get(id) ?? [];
      if (!names.includes(name)) instruments.set(id, [...names, name]);
    };

    for (const file of this.gitGateway.listFiles(treeRoot, pin.commit, `${pin.path}/features`)) {
      if (!file.endsWith('.feature')) continue;
      const name = file.slice(pin.path.length + 1);
      for (const scenario of parseFeature(this.gitGateway.showFile(treeRoot, pin.commit, file))
        .scenarios) {
        for (const id of scenario.tags) add(id, `${name}: ${scenario.name}`);
      }
    }

    const globs =
      this.projectRepo.readExecutorConfig(projectPath)?.criteria?.testGlobs ?? DEFAULT_TEST_GLOBS;
    // The glob rules are the path guard's. shortcut: one `git show` per test
    // file; read a tree archive instead if a project's suite makes this slow.
    for (const file of findViolations(this.committedFiles(projectPath), globs)) {
      for (const tag of testTags(this.gitGateway.showFile(projectPath, 'HEAD', file))) {
        add(tag.id, tag.title === null ? file : `${file}: ${tag.title}`);
      }
    }

    return traceCriteria({
      ...parseCriteria(this.gitGateway.showFile(treeRoot, pin.commit, `${pin.path}/spec.md`)),
      claims: new Map(
        this.ticketRepo
          .findChildren(epic.projectId, epic.id)
          .map((task) => [task.id, task.implements ?? []]),
      ),
      instruments,
    });
  }

  private committedFiles(projectPath: string): string[] {
    try {
      return this.gitGateway.listFiles(projectPath, 'HEAD', '.');
    } catch {
      return []; // no commit yet: there is no test to find
    }
  }
}
