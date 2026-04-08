// Adapter — Filesystem implementation of ArtifactStore port

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import { aeosDir } from './fs-project.repository.js';

const AEOS_DIR = '.aeos';
const TICKETS_DIR = 'tickets';

function validatePathComponent(value: string, name: string): void {
  if (value.includes('..') || value.includes(path.sep) || value.includes('/')) {
    throw new Error(`Invalid ${name}: must not contain path separators or '..' segments`);
  }
}

/**
 * Returns the canonical path for a ticket artifact inside .aeos/tickets/<ticketId>/.
 * Pattern: <projectRoot>/.aeos/tickets/<ticketId>/<ticketId>-<artifactName>
 *
 * Example:
 *   artifactPath('AEOS-1', 'prd.md')
 *   → '/path/to/project/.aeos/tickets/AEOS-1/AEOS-1-prd.md'
 */
export function artifactPath(ticketId: string, artifactName: string, root?: string): string {
  validatePathComponent(ticketId, 'ticketId');
  validatePathComponent(artifactName, 'artifactName');
  return path.join(aeosDir(root), TICKETS_DIR, ticketId, `${ticketId}-${artifactName}`);
}

/**
 * Writes content to the canonical artifact path for a ticket.
 * Creates the ticket directory (.aeos/tickets/<ticketId>/) if it doesn't exist.
 * Returns the absolute path of the written file.
 */
export function writeArtifact(
  ticketId: string,
  artifactName: string,
  content: string,
  root?: string,
): string {
  const filePath = artifactPath(ticketId, artifactName, root);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Returns all artifact **absolute paths** for a ticket (reads disk).
 * Returns only files that actually exist in .aeos/tickets/<ticketId>/.
 * Filters files matching the ticket ID prefix pattern.
 * If the directory does not exist, returns [].
 *
 * Note: Unlike `FsArtifactStore.listArtifacts()` which returns bare filenames,
 * this standalone function returns full absolute paths.
 */
export function listArtifacts(ticketId: string, root?: string): string[] {
  validatePathComponent(ticketId, 'ticketId');
  const dir = path.join(aeosDir(root), TICKETS_DIR, ticketId);
  try {
    const prefix = `${ticketId}-`;
    return fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(prefix) && fs.statSync(path.join(dir, f)).isFile())
      .map((f) => path.join(dir, f))
      .sort();
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export class FsArtifactStore implements ArtifactStore {
  readArtifact(projectPath: string, ticketId: string, filename: string): string {
    FsArtifactStore.validatePathComponent(ticketId, 'ticketId');
    FsArtifactStore.validatePathComponent(filename, 'filename');
    const filePath = path.join(projectPath, AEOS_DIR, TICKETS_DIR, ticketId, filename);
    return fs.readFileSync(filePath, 'utf-8');
  }

  writeArtifact(projectPath: string, ticketId: string, filename: string, content: string): void {
    FsArtifactStore.validatePathComponent(ticketId, 'ticketId');
    FsArtifactStore.validatePathComponent(filename, 'filename');
    const dir = path.join(projectPath, AEOS_DIR, TICKETS_DIR, ticketId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  removeArtifact(projectPath: string, ticketId: string, filename: string): void {
    FsArtifactStore.validatePathComponent(ticketId, 'ticketId');
    FsArtifactStore.validatePathComponent(filename, 'filename');
    const filePath = path.join(projectPath, AEOS_DIR, TICKETS_DIR, ticketId, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  listArtifacts(projectPath: string, ticketId: string): string[] {
    FsArtifactStore.validatePathComponent(ticketId, 'ticketId');
    const dir = path.join(projectPath, AEOS_DIR, TICKETS_DIR, ticketId);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => fs.statSync(path.join(dir, f)).isFile())
      .sort();
  }

  private static validatePathComponent(value: string, name: string): void {
    validatePathComponent(value, name);
  }
}
