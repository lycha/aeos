// Adapter — YAML+Zod implementation of AgentSpecLoader port

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { AgentSpec } from '../../domain/model/agent-spec.js';
import { AgentSpecSchema } from './schemas.js';
import type { AgentSpecLoader } from '../../domain/ports/driven/agent-spec-loader.port.js';
import { AgentSpecNotFoundError } from '../../shared/errors.js';
import { aeosDir } from '../filesystem/fs-project.repository.js';

export class YamlAgentSpecLoader implements AgentSpecLoader {
  /**
   * Loads and validates an agent spec YAML file.
   * `agentFile` is relative to aeosDir() (e.g. 'agents/pm-agent.yaml')
   * Throws AgentSpecNotFoundError if the file does not exist.
   * Throws ZodError if the file content does not match the schema.
   */
  load(agentFile: string, root?: string): AgentSpec {
    const base = aeosDir(root);
    const resolved = path.resolve(base, agentFile);
    if (!resolved.startsWith(base)) {
      throw new AgentSpecNotFoundError(`Path escapes .aeos/ boundary: ${agentFile}`);
    }
    const specPath = resolved;

    let raw: string;
    try {
      raw = fs.readFileSync(specPath, 'utf-8');
    } catch {
      throw new AgentSpecNotFoundError(`Agent spec file not found: ${specPath}`);
    }

    const parsed: unknown = yaml.load(raw, { schema: yaml.DEFAULT_SCHEMA });
    return AgentSpecSchema.parse(parsed);
  }
}
