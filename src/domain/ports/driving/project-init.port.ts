// Driving port — ProjectInit use case interface

export interface ProjectInitInput {
  name: string;
  key: string;
  cwd: string;
}

export interface ProjectInitResult {
  name: string;
  key: string;
}

export interface ProjectInitPort {
  execute(input: ProjectInitInput): ProjectInitResult;
}
