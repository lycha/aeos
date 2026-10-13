// Driven port — RubricLoader: load rubric markdown files from .aeos/ directory

/**
 * Loads rubric file content by path (relative to .aeos/).
 * Returns null if the rubric file does not exist.
 */
export interface RubricLoader {
  load(rubricPath: string, projectPath: string): Promise<string | null>;
}
