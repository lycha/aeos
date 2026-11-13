// Web — ticket artifact resolution (tech spec §2.9/§3.11): serves a ticket's
// files only by exact ticket+artifact-name match against
// `ArtifactStore.listArtifacts(ticketId)`, never by a path taken from the
// request (AC-32). The route layer (T-010) is what sets the response's
// `Content-Type: text/plain; charset=utf-8` so any markup in an artifact
// stays inert (AC-31).

import { FsArtifactStore } from '../infrastructure/filesystem/fs-artifact-store.adapter.js';

const artifactStore = new FsArtifactStore();

export type ArtifactResult =
  | { ok: true; content: string }
  | { ok: false; reason: 'ARTIFACT_NOT_FOUND' };

/**
 * Resolves `artifactName` against the ticket's own artifact listing and
 * returns its content on an exact match. A name absent from that list —
 * including a traversal attempt — is refused without ever reading the
 * filesystem for it.
 */
export function resolve(
  projectPath: string,
  ticketId: string,
  artifactName: string,
): ArtifactResult {
  const names = artifactStore.listArtifacts(projectPath, ticketId);
  if (!names.includes(artifactName)) return { ok: false, reason: 'ARTIFACT_NOT_FOUND' };
  return { ok: true, content: artifactStore.readArtifact(projectPath, ticketId, artifactName) };
}
