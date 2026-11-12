// Driving port — ProjectInit use case interface

import type { PipelineChoice } from '../driven/project-repository.port.js';

export interface ProjectInitInput {
  name: string;
  key: string;
  cwd: string;
  /** Column pipeline to scaffold. Defaults to `standard`. */
  pipeline?: PipelineChoice;
}

export interface ProjectInitResult {
  name: string;
  key: string;
  /**
   * Template files written into .aeos/, relative to it. Empty on a re-run
   * where everything was already present.
   */
  scaffolded: string[];
}

export interface ProjectInitPort {
  execute(input: ProjectInitInput): ProjectInitResult;
}
