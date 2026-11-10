// Adapter — Filesystem implementation of RunRecordStore port

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runRecordPaths, type RunRecord } from '../../domain/model/run-record.js';
import type { RunRecordStore } from '../../domain/ports/driven/run-record-store.port.js';
import { validatePathComponent } from './fs-artifact-store.adapter.js';

export class FsRunRecordStore implements RunRecordStore {
  write(
    projectPath: string,
    record: RunRecord,
    files: { brief: string; transcript: string },
  ): string[] {
    validatePathComponent(record.ticket, 'ticketId');
    validatePathComponent(record.run_id, 'runId');
    const paths = runRecordPaths(record.ticket, record.run_id);
    const abs = (relative: string): string => path.join(projectPath, '.aeos', relative);
    fs.mkdirSync(path.dirname(abs(paths.record)), { recursive: true });
    fs.writeFileSync(abs(paths.record), `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
    fs.writeFileSync(abs(paths.brief), files.brief, 'utf-8');
    fs.writeFileSync(abs(paths.transcript), files.transcript, 'utf-8');
    return [abs(paths.record), abs(paths.brief), abs(paths.transcript)];
  }

  list(projectPath: string, ticketId: string): RunRecord[] {
    validatePathComponent(ticketId, 'ticketId');
    const dir = path.join(projectPath, '.aeos', 'tickets', ticketId, 'runs');
    if (!fs.existsSync(dir)) return [];
    // Run ids start with a UTC timestamp, so name order is time order.
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as RunRecord);
  }
}
