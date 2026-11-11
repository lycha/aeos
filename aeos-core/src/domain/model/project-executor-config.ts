// Value Object — ProjectExecutorConfig (extends Project with optional executor defaults)

import type { Project } from './project.js';

/** One entry of the `checks` list in `.aeos/project.json`. */
export interface CheckConfig {
  readonly name: string;
  readonly command: string;
  readonly timeoutSeconds: number;
}

/** One entry of the `generators` list in `.aeos/project.json`. */
export interface GeneratorConfig {
  readonly name: string;
  readonly command: string;
  /** Globs. The generator runs when the content of what they match has changed. */
  readonly inputs: readonly string[];
  /** Globs of what the command writes: committed by the engine, protected from agents. */
  readonly outputs: readonly string[];
}

export interface ProjectExecutorConfig extends Project {
  /** Run before the worker of an agentic column, each when its inputs changed. */
  readonly generators?: readonly GeneratorConfig[];
  /**
   * Globs of the project's hard contracts. Not protected: a ticket may change
   * one, and then needs a person's `ticket approve --contract`. Generator
   * `inputs` are contracts without being listed.
   */
  readonly contracts?: readonly string[];
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
