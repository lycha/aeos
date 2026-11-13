// Web — reads with no business rule, no terminal equivalent, and no write
// path (tech spec §2.9): the ticket-create form's spec picker (AC-24). The
// read side of the answer/resolve forms lives in qa-documents.ts (§2.6)
// instead, since it shares that module's staleness primitive.

import { FsArtefactTree } from '../infrastructure/filesystem/fs-artefact-tree.adapter.js';

const artefactTree = new FsArtefactTree();

/** The feature names present in the project's artefact tree, sorted. */
export function listFeatures(projectPath: string): string[] {
  return artefactTree.listFeatures(projectPath);
}
