// Adapter — YAML implementation of the GateRecordStore port.
//
// One file per feature (`features/<feature>/gates.yaml` in the artefact tree)
// for spec-backed tickets, else one per ticket
// (`.aeos/tickets/<id>/<id>-gates.yaml`). `records:` is the last key, so a new
// record is appended as text and the earlier ones are never rewritten.

import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';

import type { GateRecord } from '../../domain/model/gate-record.js';
import type { ArtefactTree } from '../../domain/ports/driven/artefact-tree.port.js';
import type { GateRecordStore } from '../../domain/ports/driven/gate-record-store.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import { validatePathComponent } from './fs-artifact-store.adapter.js';

const FEATURE_PREFIX = 'features/';

function readRecords(file: string): GateRecord[] {
  if (!fs.existsSync(file)) return [];
  const document = yaml.load(fs.readFileSync(file, 'utf-8')) as { records?: GateRecord[] | null };
  return document?.records ?? [];
}

export class FsGateRecordStore implements GateRecordStore {
  constructor(
    private readonly artefactTree: ArtefactTree,
    private readonly gitGateway: GitGateway,
  ) {}

  append(
    projectPath: string,
    record: Omit<GateRecord, 'id'>,
    alongside?: (numbered: GateRecord) => Readonly<Record<string, string>>,
  ): GateRecord {
    validatePathComponent(record.ticket, 'ticketId');
    const feature = record.spec_pin?.path.startsWith(FEATURE_PREFIX)
      ? record.spec_pin.path.slice(FEATURE_PREFIX.length)
      : null;
    // The repository the file is committed to: the tree for a feature, `.aeos` for a ticket.
    const repoDir = feature ? this.artefactTree.root(projectPath) : path.join(projectPath, '.aeos');
    const file = feature
      ? this.featureFile(projectPath, feature)
      : this.ticketFile(projectPath, record.ticket);

    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
    const numbered: GateRecord = { id: `GATE-${readRecords(file).length + 1}`, ...record };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (before === null) {
      fs.writeFileSync(file, yaml.dump({ schema_version: 0, feature }) + 'records:\n', 'utf-8');
    }
    fs.appendFileSync(file, yaml.dump([numbered], { lineWidth: -1 }), 'utf-8');
    const beside = Object.entries(alongside?.(numbered) ?? {}).map(([name, content]) => {
      const besideFile = path.join(path.dirname(file), name);
      fs.writeFileSync(besideFile, content, 'utf-8');
      return besideFile;
    });
    try {
      this.gitGateway.commitFiles(
        repoDir,
        [file, ...beside],
        `[${record.ticket}][GATE][${numbered.id}][human][${record.gate}: ${record.verdict}]`,
      );
    } catch (err) {
      // An uncommitted record would be taken for a decision that was recorded.
      if (before === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, before, 'utf-8');
      throw err;
    }
    return numbered;
  }

  list(projectPath: string, filter: { feature?: string; ticketId?: string } = {}): GateRecord[] {
    const { feature, ticketId } = filter;
    const features = feature ? [feature] : this.artefactTree.listFeatures(projectPath);
    const files = features.map((name) => this.featureFile(projectPath, name));
    if (!feature) {
      const ticketsDir = path.join(projectPath, '.aeos', 'tickets');
      const tickets = ticketId
        ? [ticketId]
        : fs.existsSync(ticketsDir)
          ? fs.readdirSync(ticketsDir).sort()
          : [];
      files.push(...tickets.map((id) => this.ticketFile(projectPath, id)));
    }
    return files
      .flatMap(readRecords)
      .filter((record) => ticketId === undefined || record.ticket === ticketId);
  }

  private featureFile(projectPath: string, feature: string): string {
    return path.join(this.artefactTree.featureDir(projectPath, feature), 'gates.yaml');
  }

  private ticketFile(projectPath: string, ticketId: string): string {
    return path.join(projectPath, '.aeos', 'tickets', ticketId, `${ticketId}-gates.yaml`);
  }
}
