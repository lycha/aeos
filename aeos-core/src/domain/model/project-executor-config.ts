// Value Object — ProjectExecutorConfig (extends Project with optional executor defaults)

import type { Project } from './project.js';

/** One entry of the `checks` list in `.aeos/project.json`. */
export interface CheckConfig {
  readonly name: string;
  readonly command: string;
  readonly timeoutSeconds: number;
}

export interface ProjectExecutorConfig extends Project {
  /** Run in this order before the reviewer, on columns with `runChecks`. */
  readonly checks?: readonly CheckConfig[];
  /** Globs no agent may touch, added to the built-in protected paths. */
  readonly protectedPaths?: readonly string[];
  /** `enabled: false` turns off pushing and pull requests, for a local project. */
  readonly pullRequests?: { readonly enabled?: boolean };
  /** Column labels by identifier, for `BACKLOG` and `DONE`, which have no column spec. */
  readonly labels?: Readonly<Record<string, string>>;
  /** `testGlobs`: the files criterion tracing scans for `AC-n` tags. Default `DEFAULT_TEST_GLOBS`. */
  readonly criteria?: {
    readonly testGlobs?: readonly string[];
    /** How the conformance report gets test results: a command, and the report it writes. */
    readonly testReport?: {
      readonly command: string;
      /** Relative to the project root. */
      readonly path: string;
      readonly format: 'vitest-json';
    };
  };
  /** Root of the artefact tree, relative to the project root. Default `.aeos`. */
  readonly artefactTree?: string;
  readonly executor?: {
    readonly type?: 'claude-cli' | 'auggie-cli' | 'opencode-cli' | 'ollama-cli';
    readonly model?: string;
  };
}
