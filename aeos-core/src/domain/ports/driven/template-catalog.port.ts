// Driven port — TemplateCatalog: reads shipped templates and the project's copies.
//
// Backs `aeos project sync`, which reconciles a project's scaffolded
// `.aeos/{column-specs,agents,rubrics}` against the current package templates.
// Kept as a port so the sync use case can be tested against a fake catalog
// without touching the filesystem.

export interface TemplateEntry {
  /** Path relative to `.aeos/`, e.g. `column-specs/task-breakdown.yaml`. */
  readonly relativePath: string;
  /** The shipped template content. */
  readonly content: string;
}

export interface TemplateCatalog {
  /** Every shipped template file (column specs, agents, rubrics). */
  list(): TemplateEntry[];
  /** The project's copy of a template file, or null when it does not exist. */
  readProjectCopy(projectPath: string, relativePath: string): string | null;
  /** Writes content to the project's copy, creating parent directories. */
  write(projectPath: string, relativePath: string, content: string): void;
  /**
   * Renames the project's existing copy to a sibling backup so a subsequent
   * write does not lose local edits. Returns the backup's path relative to
   * `.aeos/`. Only called when a copy exists.
   */
  backup(projectPath: string, relativePath: string): string;
}
