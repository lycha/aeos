import { describe, expect, it } from 'vitest';

import { DEFAULT_PROTECTED_PATHS, findViolations, protectedGlobs } from './path-guard.js';

describe('findViolations', () => {
  it('matches a literal pattern only exactly', () => {
    expect(
      findViolations(
        ['.aeos/project.json', '.aeos/project.json.bak', 'x/.aeos/project.json'],
        ['.aeos/project.json'],
      ),
    ).toEqual(['.aeos/project.json']);
  });

  it('matches * within one segment, never across a slash', () => {
    expect(
      findViolations(
        ['src/a.ts', 'src/deep/a.ts', 'src/a.js', 'tickets/T-1/runs', 'tickets/T-1/x/runs'],
        ['src/*.ts', 'tickets/*/runs'],
      ),
    ).toEqual(['src/a.ts', 'tickets/T-1/runs']);
  });

  it('matches ** across any number of segments, including none', () => {
    expect(
      findViolations(
        ['.aeos/rubrics/a.md', '.aeos/rubrics/structure/a.md', '.aeos/rubric', 'docs/a.md'],
        ['.aeos/rubrics/**'],
      ),
    ).toEqual(['.aeos/rubrics/a.md', '.aeos/rubrics/structure/a.md']);
    expect(findViolations(['a/z', 'a/b/c/z', 'a/z/y'], ['a/**/z'])).toEqual(['a/z', 'a/b/c/z']);
  });

  it('treats regex characters in a pattern as literals', () => {
    expect(findViolations(['a+b.md', 'aab.md', 'a+bxmd'], ['a+b.md'])).toEqual(['a+b.md']);
  });

  it('reports nothing for paths outside every pattern', () => {
    expect(findViolations(['src/index.ts'], DEFAULT_PROTECTED_PATHS)).toEqual([]);
  });
});

describe('protectedGlobs', () => {
  it('protects a new ticket directory only beneath runs/', () => {
    expect(
      findViolations(
        ['.aeos/tickets/EE-2/EE-2-ticket.md', '.aeos/tickets/EE-2/runs/RUN-1.json'],
        protectedGlobs(),
      ),
    ).toEqual(['.aeos/tickets/EE-2/runs/RUN-1.json']);
  });

  it('protects the CLI contract wherever the project keeps it', () => {
    const changed = ['cli-contract.yaml', 'aeos-core/cli-contract.yaml', 'docs/cli-contract.md'];

    expect(findViolations(changed, protectedGlobs())).toEqual([
      'cli-contract.yaml',
      'aeos-core/cli-contract.yaml',
    ]);
  });

  it('adds configured globs to the defaults', () => {
    expect(
      findViolations(['src/cli/generated/a.ts'], protectedGlobs(['src/cli/generated/**'])),
    ).toEqual(['src/cli/generated/a.ts']);
  });

  it('keeps a default that configuration tries to list as unprotected', () => {
    const globs = protectedGlobs(['!.aeos/rubrics/**']);

    expect(globs).toEqual(expect.arrayContaining([...DEFAULT_PROTECTED_PATHS]));
    expect(findViolations(['.aeos/rubrics/structure/code-structure.md'], globs)).toEqual([
      '.aeos/rubrics/structure/code-structure.md',
    ]);
  });
});
