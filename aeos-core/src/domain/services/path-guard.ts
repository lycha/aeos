// Domain service — path guard: which changed files an agent was not allowed to touch
//
// Glob rules, on `/`-separated paths relative to the project root:
//   - a literal segment matches itself, exactly
//   - `*` matches any run of characters inside one segment, never a `/`
//   - a `**` segment matches any number of segments, including none; as the
//     last segment it matches everything beneath the prefix
// There is no negation: a pattern can only add protection.

/** Always protected. Configuration adds to this list and cannot shorten it. */
export const DEFAULT_PROTECTED_PATHS: readonly string[] = [
  '.aeos/project.json',
  '.aeos/pipelines.yaml',
  '.aeos/CONSTRAINTS.md',
  '.aeos/rubrics/**',
  '.aeos/column-specs/**',
  '.aeos/agents/**',
  '.aeos/schemas/**',
  '.aeos/features/**',
  '.aeos/contexts/**',
  '.aeos/tickets/*/runs/**',
  // The human-owned CLI contract, wherever the project keeps it.
  '**/cli-contract.yaml',
];

/** The defaults plus the project's `protectedPaths`. */
export function protectedGlobs(configured: readonly string[] = []): string[] {
  return [...DEFAULT_PROTECTED_PATHS, ...configured];
}

function toRegExp(glob: string): RegExp {
  const segments = glob.split('/');
  const body = segments
    .map((segment, index) => {
      const last = index === segments.length - 1;
      if (segment === '**') return last ? '.*' : '(?:[^/]+/)*';
      const literal = segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
      return last ? literal : `${literal}/`;
    })
    .join('');
  return new RegExp(`^${body}$`);
}

/** The changed paths that match at least one glob, in the order given. */
export function findViolations(
  changedPaths: readonly string[],
  globs: readonly string[],
): string[] {
  const patterns = globs.map(toRegExp);
  return changedPaths.filter((changed) => patterns.some((pattern) => pattern.test(changed)));
}
