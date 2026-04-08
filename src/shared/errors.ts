// Shared kernel — base error classes for the AEOS domain

export class ProjectRootNotFoundError extends Error {
  constructor(message?: string) {
    super(message ?? 'No .aeos/ directory found in any parent directory');
    this.name = 'ProjectRootNotFoundError';
  }
}

export class ProjectConfigNotFoundError extends Error {
  constructor() {
    super("project.json not found. Run 'aeos project init' first.");
    this.name = 'ProjectConfigNotFoundError';
  }
}

export class ProjectConfigCorruptError extends Error {
  constructor() {
    super("project.json is corrupt. Run 'aeos project init' to re-initialise.");
    this.name = 'ProjectConfigCorruptError';
  }
}

export class ColumnSpecNotFoundError extends Error {
  constructor(message?: string) {
    super(message ?? 'Column spec not found');
    this.name = 'ColumnSpecNotFoundError';
  }
}

export class AgentSpecNotFoundError extends Error {
  constructor(message?: string) {
    super(message ?? 'Agent spec not found');
    this.name = 'AgentSpecNotFoundError';
  }
}
