// Turns configuration into the checks the stage runs: one ShellCheck per
// `.aeos/project.json` entry, in the order written, then any registered check.

import type { Check } from '../../domain/model/check.js';
import type { ChecksRunner } from '../../domain/ports/driven/checks-runner.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import { ShellCheck } from './shell-check.js';

export class CheckRegistry {
  private readonly registered: Check[] = [];

  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly runner: ChecksRunner,
  ) {}

  register(check: Check): void {
    this.registered.push(check);
  }

  checksFor(projectPath: string): Check[] {
    const configured = this.projectRepo.readExecutorConfig(projectPath)?.checks ?? [];
    return [...configured.map((config) => new ShellCheck(config, this.runner)), ...this.registered];
  }
}
