// Adapter — YAML+Zod implementation of PipelineLoader port

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import type { Pipelines } from '../../domain/model/column.js';
import { isValidTicketKind } from '../../domain/model/ticket-kind.js';
import type { ColumnSpecLoader } from '../../domain/ports/driven/column-spec-loader.port.js';
import type { PipelineLoader } from '../../domain/ports/driven/pipeline-loader.port.js';
import { pipelineErrors } from '../../domain/services/pipeline-validation.js';
import { ColumnSpecNotFoundError } from '../../shared/errors.js';
import { aeosDir } from '../filesystem/fs-project.repository.js';
import { templatesRoot } from '../filesystem/template-source.js';
import { PipelinesSchema } from './schemas.js';

const PIPELINES_FILE = 'pipelines.yaml';

/** The pipelines AEOS ships: what `project init` scaffolds. */
export function templatePipelines(): Pipelines {
  return parsePipelines(path.join(templatesRoot(), PIPELINES_FILE));
}

/**
 * The project's pipelines as written, checked for shape only. A project with
 * no file (one scaffolded before the file existed) gets the shipped template.
 */
export function readPipelines(root?: string): Pipelines {
  const own = path.join(aeosDir(root), PIPELINES_FILE);
  return fs.existsSync(own) ? parsePipelines(own) : templatePipelines();
}

function parsePipelines(file: string): Pipelines {
  const document = yaml.load(fs.readFileSync(file, 'utf-8'));

  const kinds = (document as { pipelines?: unknown } | null)?.pipelines;
  const unknown = Object.keys(kinds && typeof kinds === 'object' ? kinds : {}).filter(
    (kind) => !isValidTicketKind(kind),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Invalid ${file}: unknown ticket kind ${unknown.join(', ')}. A project orders the EPIC and TASK pipelines; new kinds are not supported.`,
    );
  }
  const parsed = PipelinesSchema.safeParse(document);
  if (!parsed.success) throw new Error(`Invalid ${file}:\n${z.prettifyError(parsed.error)}`);
  return parsed.data.pipelines;
}

export class YamlPipelineLoader implements PipelineLoader {
  constructor(private readonly columnSpecLoader: ColumnSpecLoader) {}

  load(root?: string): Pipelines {
    const pipelines = readPipelines(root);
    const errors = pipelineErrors(pipelines, (column) => {
      try {
        return this.columnSpecLoader.load(column, root).role ?? 'standard';
      } catch (err) {
        if (err instanceof ColumnSpecNotFoundError) return null;
        throw err;
      }
    });
    if (errors.length > 0) {
      throw new Error(`Invalid ${PIPELINES_FILE}:\n${errors.join('\n')}`);
    }
    return pipelines;
  }
}
