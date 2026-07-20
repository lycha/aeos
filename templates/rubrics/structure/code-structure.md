# Code Structure Rubric

Evaluates the thoroughness and quality of a Code Review artifact.
The reviewer applies each criterion independently. A code review must **PASS** all criteria to be accepted.
Any **FAIL** blocks advancement; **WARN** requires the reviewer to flag the issue but does not block.

---

## 1. Diff Alignment with Tech Spec

Evaluates whether the code changes in the diff correspond to the requirements and design decisions documented in the approved tech spec.

| Grade | Definition |
|-------|------------|
| **PASS** | Every changed file and behaviour in the diff is traced to a tech spec requirement or justified supporting concern (e.g., refactoring required by a new pattern). The reviewer explicitly maps diff hunks to spec items and confirms no requirement is left unaddressed by the diff. |
| **WARN** | Most diff changes are traced to tech spec requirements, but one or more hunks lack explicit linkage. The changes appear consistent with the spec but the mapping is asserted rather than demonstrated. |
| **FAIL** | The review does not reference the tech spec at all, or significant portions of the diff are unrelated to any tech spec requirement. Orphan changes (code not driven by a requirement) are present and unacknowledged. |

---

## 2. Naming Conventions

Evaluates whether the reviewer assessed adherence to project naming conventions for files, classes, functions, variables, and constants.

| Grade | Definition |
|-------|------------|
| **PASS** | The review explicitly evaluates naming in the diff against project conventions (e.g., camelCase for variables, PascalCase for classes, kebab-case for filenames). Deviations are flagged. Names are descriptive and consistent with existing codebase patterns. |
| **WARN** | The review mentions naming but does not systematically check conventions — e.g., one or two names are commented on while others are ignored. No evidence of checking against project-wide patterns. |
| **FAIL** | The review does not evaluate naming at all. No mention of variable names, function names, file names, or adherence to project conventions. |

---

## 3. Error Handling Coverage

Evaluates whether the reviewer assessed error handling, edge cases, and failure modes in the code changes.

| Grade | Definition |
|-------|------------|
| **PASS** | The review identifies error-handling paths in the diff and evaluates their correctness and completeness. Specific checks include: try/catch coverage, error propagation strategy, user-facing error messages, and handling of null/undefined or unexpected inputs. Edge cases relevant to the changed code are called out. |
| **WARN** | Error handling is mentioned generically (e.g., "error handling looks fine") but no specific error paths, catch blocks, or edge cases are identified. The reviewer acknowledges the concern without demonstrating analysis. |
| **FAIL** | The review does not mention error handling, edge cases, or failure modes. Changed code that introduces new error paths is left unexamined. |

---

## 4. Test Coverage Adequacy

Evaluates whether the reviewer assessed that tests accompanying the code changes are sufficient in scope and quality.

| Grade | Definition |
|-------|------------|
| **PASS** | The review evaluates test changes alongside code changes. It confirms: (a) new code paths have corresponding test cases, (b) modified behaviour has updated tests, (c) both happy-path and error-case scenarios are tested, and (d) test assertions are meaningful (not just "does not throw"). Missing test coverage is flagged explicitly. |
| **WARN** | The review acknowledges tests exist but does not evaluate their sufficiency — e.g., "tests are included" without assessing coverage of new code paths, error cases, or boundary conditions. |
| **FAIL** | The review does not mention tests at all, or dismisses testing with "tests will be added later" or equivalent. Code changes that lack any test coverage are accepted without comment. |

---

## 5. No Dead Code or Debug Artifacts

Evaluates whether the reviewer checked for dead code, debug statements, commented-out code, TODO/FIXME markers, and other artifacts that should not reach production.

| Grade | Definition |
|-------|------------|
| **PASS** | The review explicitly confirms that the diff contains no dead code, leftover debug statements (e.g., `console.log`, `debugger`, `print`), commented-out code blocks, or unresolved TODO/FIXME/HACK markers. If any are found, they are flagged. |
| **WARN** | The review mentions code cleanliness in passing but does not systematically check for debug artifacts, commented-out code, or TODO markers. The reviewer's assessment is superficial. |
| **FAIL** | The review does not evaluate code cleanliness. No mention of dead code, debug statements, or leftover artifacts. The diff may contain `console.log` statements or commented-out blocks without comment from the reviewer. |

---

## 6. Dependency Changes Justified

Evaluates whether any new, removed, or updated dependencies in the diff are justified and reviewed for risk.

| Grade | Definition |
|-------|------------|
| **PASS** | Every dependency change (new packages, version bumps, removals) in the diff is identified and justified. The review evaluates: necessity of the dependency, licence compatibility, bundle size impact (for frontend), security posture, and whether an existing dependency could serve the same purpose. If no dependency changes exist, the review explicitly states "no dependency changes". |
| **WARN** | Dependency changes are acknowledged but not fully evaluated — e.g., "added lodash" without justifying why it was needed or whether a lighter alternative exists. Risk assessment (licence, security, size) is absent. |
| **FAIL** | Dependency changes in the diff are ignored entirely. New packages are added without any mention in the review, or the review does not address dependency changes when they are present. |

---

## Validation: Hypothetical Sloppy Code Review

The following hypothetical code review is evaluated against the rubric to confirm detection:

> **Code Review for PR #42: Add user preferences endpoint**
>
> LGTM 👍
> Looks good to me. Ship it.

| Criterion | Grade | Rationale |
|-----------|-------|-----------|
| 1. Diff Alignment with Tech Spec | **FAIL** | No reference to the tech spec. No mapping of diff changes to requirements. The reviewer cannot have verified alignment with a one-line response. |
| 2. Naming Conventions | **FAIL** | No evaluation of naming. The reviewer did not examine any identifiers in the code. |
| 3. Error Handling Coverage | **FAIL** | No mention of error handling, edge cases, or failure modes. |
| 4. Test Coverage Adequacy | **FAIL** | No mention of tests. The reviewer did not assess whether test coverage exists or is sufficient. |
| 5. No Dead Code or Debug Artifacts | **FAIL** | No evaluation of code cleanliness. Debug statements or dead code could be present without detection. |
| 6. Dependency Changes Justified | **FAIL** | No mention of dependency changes. Any new packages in the diff were ignored. |

**Result:** All 6 criteria trigger FAIL, confirming the rubric catches superficial, low-effort code reviews that provide no analytical value. A review that says only "LGTM" without substantive analysis will never pass this rubric.
