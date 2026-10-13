# Implementation Structure Rubric

Evaluates the structural completeness and quality of an Implementation Notes artifact.
The reviewer applies each criterion independently. An implementation plan must **PASS** all criteria to advance to CODE_REVIEW.
Any **FAIL** blocks advancement; **WARN** requires the reviewer to flag the issue but does not block.

---

## 1. Tech Spec Requirement Coverage

Evaluates whether every requirement from the approved tech spec is addressed in the implementation plan.

| Grade | Definition |
|-------|------------|
| **PASS** | Every functional and non-functional requirement in the tech spec has a corresponding entry in the implementation plan. Each entry identifies the requirement it fulfils (by name or reference) and describes how it will be implemented. No tech spec requirement is left unmentioned. |
| **WARN** | Most tech spec requirements are addressed but one or more non-critical requirements lack explicit implementation entries. The omitted requirements are inferable from context but not explicitly mapped. |
| **FAIL** | Multiple tech spec requirements have no corresponding implementation entry. The reader cannot confirm that the full scope of the tech spec will be delivered. |

---

## 2. File Change Justification

Evaluates whether every file to be created, modified, or deleted is listed and traced to a specific requirement or implementation goal.

| Grade | Definition |
|-------|------------|
| **PASS** | All file changes (new files, modified files, deleted files) are enumerated. Each change states which requirement or implementation goal it serves. File paths are concrete (not placeholders). A reviewer can verify that every change is necessary and no unnecessary files are touched. |
| **WARN** | File changes are listed but some lack explicit justification — e.g., a file is mentioned without stating which requirement drives the change, or paths use vague references ("update the config file") instead of concrete paths. |
| **FAIL** | No file change list is provided, or files are mentioned only in passing within prose. The reviewer cannot determine the blast radius of the implementation. |

---

## 3. Test Plan Adequacy

Evaluates whether the implementation plan includes a test plan that covers happy-path scenarios, error cases, and edge conditions.

| Grade | Definition |
|-------|------------|
| **PASS** | A dedicated test plan section exists. It enumerates: (a) happy-path test cases for each major feature or behaviour, (b) error-case tests covering validation failures, infrastructure errors, and domain exceptions, and (c) edge cases or boundary conditions where applicable. Each test case states what is being tested and the expected outcome. Test level (unit, integration, e2e) is identified for each case. |
| **WARN** | A test plan exists but is incomplete — e.g., only happy-path tests are listed, error cases are mentioned generically ("error handling will be tested"), or test levels are not specified. The reviewer can see testing intent but cannot verify coverage adequacy. |
| **FAIL** | No test plan or testing section is present. Alternatively, testing is dismissed ("tests will be added later") without any concrete plan. The reviewer cannot assess whether the implementation will be verified. |

---

## 4. Rollback Plan

Evaluates whether the implementation plan describes how to revert the change if it causes issues in production or downstream columns.

| Grade | Definition |
|-------|------------|
| **PASS** | A rollback plan is documented. It describes: how to revert the change (e.g., git revert, feature flag toggle, migration rollback), what side effects reversal may cause, and any data or state considerations. If the change is purely additive with no rollback risk, the plan explicitly states "no rollback required" with rationale. |
| **WARN** | Rollback is mentioned but lacks detail — e.g., "can be reverted" without describing how, or side effects of reversal are not addressed. |
| **FAIL** | No rollback plan, revert strategy, or "no rollback required" statement is present. The reviewer cannot assess recovery options if the implementation causes regressions. |

---

## 5. Traceability — No Orphan Changes

Evaluates whether every proposed code change traces back to a tech spec requirement. Orphan changes — modifications not linked to any requirement — indicate scope creep or unreviewed additions.

| Grade | Definition |
|-------|------------|
| **PASS** | Every file change, new component, and behavioural modification in the implementation plan is explicitly linked to a tech spec requirement or a justified supporting concern (e.g., refactoring for testability, dependency upgrade required by a new library). No unexplained changes exist. |
| **WARN** | Most changes are traced, but one or more changes lack explicit linkage to a requirement. The changes appear reasonable but the connection to the tech spec is implicit rather than stated. |
| **FAIL** | Multiple changes have no traceability to the tech spec. The implementation plan includes work that was not scoped, approved, or justified. The reviewer cannot distinguish intentional scope from accidental additions. |

---

## 6. Implementation Sequencing

Evaluates whether the implementation plan defines a logical order of execution, including dependencies between steps.

| Grade | Definition |
|-------|------------|
| **PASS** | Implementation steps are ordered with explicit sequencing. Dependencies between steps are stated (e.g., "Step 2 depends on Step 1 because the interface must exist before the adapter"). The sequence is logical — foundational changes precede dependent ones. A developer can follow the plan step-by-step without backtracking. |
| **WARN** | Steps are listed but sequencing is implicit or partially stated. Some dependencies are obvious from context but not documented. A developer could likely infer the correct order but may make mistakes. |
| **FAIL** | No sequencing information is provided. Steps are listed without order, or the order presented would cause build or test failures if followed literally (e.g., tests reference code not yet created). |

---

## Validation: Hypothetical Incomplete Implementation Plan

The following hypothetical implementation plan excerpt is evaluated against the rubric to confirm detection:

> **Title:** Add User Preferences Feature
>
> We'll update the user service to support preferences. Changes include modifying the user model,
> adding a new API endpoint, and updating the frontend. We also plan to refactor the
> authentication middleware while we're in there. Tests will be written once the code is stable.

| Criterion | Grade | Rationale |
|-----------|-------|-----------|
| 1. Tech Spec Requirement Coverage | **WARN** | "Preferences" are mentioned generically. No explicit mapping to tech spec requirements — the reader must assume the tech spec asked for these changes. |
| 2. File Change Justification | **FAIL** | No file list is provided. "Modifying the user model" and "updating the frontend" name no concrete files or paths. Blast radius is unknown. |
| 3. Test Plan Adequacy | **FAIL** | "Tests will be written once the code is stable" explicitly defers testing. No test cases, error scenarios, or coverage plan. |
| 4. Rollback Plan | **FAIL** | No rollback plan or revert strategy is mentioned. |
| 5. Traceability — No Orphan Changes | **FAIL** | "Refactor the authentication middleware while we're in there" is an orphan change — not linked to any requirement. This is scope creep with no justification. |
| 6. Implementation Sequencing | **FAIL** | No ordering or dependencies between steps. "Changes include..." is an unordered list. |

**Result:** 1 criterion triggers WARN and 5 trigger FAIL, confirming the rubric catches structural deficiencies in incomplete implementation plans. The orphan change (auth middleware refactor) is correctly flagged under criterion 5.
