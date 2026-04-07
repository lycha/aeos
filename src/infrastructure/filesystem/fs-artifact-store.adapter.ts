// Adapter — Filesystem implementation of ArtifactStore port

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';

const AEOS_DIR = '.aeos';
const TICKETS_DIR = 'tickets';

export class FsArtifactStore implements ArtifactStore {
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

  private static validatePathComponent(value: string, name: string): void {
    if (value.includes('..') || value.includes(path.sep) || value.includes('/')) {
      throw new Error(`Invalid ${name}: must not contain path separators or '..' segments`);
    }
  }
}
