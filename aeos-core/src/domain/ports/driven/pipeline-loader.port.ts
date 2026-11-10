// Driven port — PipelineLoader: the project's column order, validated

import type { Pipelines } from '../../model/column.js';

export interface PipelineLoader {
  /** Throws, with every reason, when the project's pipelines file is not valid. */
  load(root?: string): Pipelines;
}
