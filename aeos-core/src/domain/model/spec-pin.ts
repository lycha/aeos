// Value Object — SpecPin: the exact revision of a human-written spec a ticket
// is built against. A reference triple, as the artefact schemas define it.

export interface SpecPin {
  /** Identity of the artefact-tree repository: `<project key>-aeos`. */
  readonly repo: string;
  /** Commit of that repository the spec is read at. */
  readonly commit: string;
  /** Path of the feature in the tree: `features/<feature>`. */
  readonly path: string;
}
