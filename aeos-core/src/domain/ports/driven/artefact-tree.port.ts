// Driven port — ArtefactTree: where a project's human-written specification lives.
//
// The tree is `.aeos/` unless `artefactTree` in `.aeos/project.json` names
// another directory (relative to the project root).

export interface ArtefactTree {
  /** Absolute path of the tree's root. */
  root(projectPath: string): string;
  /** Absolute path of `features/<feature>` in the tree. */
  featureDir(projectPath: string, feature: string): string;
  /** True when the feature's directory exists. */
  exists(projectPath: string, feature: string): boolean;
  /** Names of the features in the tree, sorted. */
  listFeatures(projectPath: string): string[];
}
