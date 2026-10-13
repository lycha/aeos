---
name: code-review
description: 'Perform Staff SWE code reviews for TypeScript/Node.js changes with severity-tagged findings and a saved report. Use when: code review, review PR, review changes, review uncommitted changes.'
---

# Code Review (TypeScript / Node.js — DDD + Hexagonal Architecture)

Perform a Staff Software Engineer-level review of TypeScript backend and CLI changes with clear severity levels, actionable recommendations, and a saved report.

## When to Use This Skill
- Reviewing uncommitted changes, branches, or PRs for TypeScript/Node.js code.
- Reviewing implementation plans or design docs for backend changes.
- Auditing security- or data-sensitive changes before merge.
- Post-task quality gate in automated task runner pipelines.

## What You'll Need
- Review target (uncommitted changes, branch range, commit range, or specific files).
- Context on intended behavior and any known risks.
- The project uses: TypeScript strict mode, ESM (`"type": "module"`), Node 22+, Vitest, ESLint flat config, Prettier, DDD with hexagonal architecture.

## Process

### Step 1: Identify scope and source of changes
1. If this is a git repo, capture the diff scope:
   - `git status --porcelain`
   - `git diff --stat`
   - `git diff <base>...<head>` or `git diff HEAD` for uncommitted changes
2. If the repo is not git-based, ask the user to supply the file list or diff.
3. Identify generated code (`dist/`, `coverage/`, `node_modules/`) and exclude it from review.

### Step 2: Read project conventions and context
1. Read `CONSTRAINTS.md` and `eslint.config.js` for style and project-specific rules.
2. Note project architecture: `src/domain/` (pure), `src/application/` (use cases), `src/infrastructure/` (adapters), `src/cli/` (driving adapter), `src/shared/` (cross-cutting).
3. Confirm dependency direction: `cli → application → domain ← infrastructure`. Domain must have zero external imports.
4. Ask clarifying questions when requirements or behavior are unclear.

### Step 3: Review for TypeScript/Node.js risk areas
Use the verification checklist in `references/verification-checklist.md` and focus on:
- **Type safety:** no `any` usage, no unsafe type assertions, strict null checks, proper discriminated unions.
- **Architecture:** hexagonal layer violations, domain purity, port/adapter contracts, dependency direction.
- **Correctness:** error handling with typed results (not thrown exceptions), edge cases, null/undefined guards.
- **ESM compliance:** `.js` extension in imports, `"type": "module"`, no CommonJS require/module.exports.
- **Async patterns:** proper `async/await`, no unhandled promises, no fire-and-forget side effects.
- **Security:** input validation, no shell injection (use `execFile` not `exec`), path traversal prevention.
- **Data integrity:** SQLite transaction boundaries, idempotent operations, proper error rollback.
- **Performance:** no sync I/O in hot paths, no N+1 queries, efficient file operations.
- **Tests:** co-located `*.test.ts` files, meaningful assertions, domain logic covered, mocked ports.

### Step 4: Record findings with severity
1. Use severity definitions from `references/severity-levels.md`.
2. Each finding should include: ID, severity, file/function, problem, impact, and recommendation.
3. Capture positive observations that should be preserved.

### Step 5: Produce report and ask for review
1. Save the report to `code-review/REVIEW-YYYYMMDD-HHMMSS.md` using `references/review-template.md`.
2. Provide a concise chat summary: counts by severity and overall verdict.
3. Include a **Draft PR Summary** section and ask the user to review it.

## Output Template
Use the structure from `references/review-template.md`.

## References
- `references/severity-levels.md`
- `references/review-template.md`
- `references/verification-checklist.md`
