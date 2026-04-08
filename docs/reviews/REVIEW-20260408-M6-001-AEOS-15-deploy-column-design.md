# Review: M6-001 — AEOS-15 DEPLOY Phase Column Design (QA + DOD_GATE)

**Reviewed:** 2026-04-08
**Task file:** `docs/tasks/M6-001-AEOS-15-deploy-column-design.md`
**Reviewer:** Augment Agent (automated deep review)
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M6-002 through M6-006
- Prerequisite task: M6-000 (qa column spec, archived)
- Upstream tasks: M5b-001, M5b-002 (code review column)
- Prior reviews: REVIEW-20260408-M6-000, REVIEW-20260408-M5b-002
- Source code: `src/domain/model/column.ts`, `src/domain/model/sub-state.ts`, `src/domain/model/column-spec.ts`, `src/domain/services/state-machine.ts`, `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts`, `src/application/ticket-dod-approve.use-case.ts`, `src/application/services/context-assembler.ts`

---

## 1. Summary

This task produces a **design document** (not code) covering the DEPLOY phase — the final two columns (QA, DOD_GATE) before a ticket reaches DONE. It is the design prerequisite for AEOS-16 through AEOS-20 per the action plan. The task runs through the pipeline itself as ticket AEOS-15 (dogfood).

**Overall verdict:** ⚠️ APPROVE WITH REQUIRED CHANGES — Two major gaps (F-1, F-2), three medium issues (F-3, F-4, F-5), and three informational notes. The task correctly identifies the design scope but has an incorrect output path, missing critical design deliverables, and incomplete acceptance criteria.

---

## 2. Correctness vs System Design

### 2.1 Column Definitions

| Aspect | Task Description | System Design Reference | Verdict |
|--------|-----------------|------------------------|---------|
| QA column | "produces a quality report" | §2.2: Worker output `SAAS-1-qa-report.md`, reviewer output `SAAS-1-qa-signoff.md` | ✅ |
| DOD_GATE column | "holistic Definition of Done evaluation" | §2.2: Worker output `SAAS-1-dod-verification.md`, reviewer = "Human approval" | ✅ |
| Phase group | DEPLOY | §2.1: DEPLOY phase contains QA and DoD Gate | ✅ |
| Flow direction | QA → DOD_GATE → DONE | `COLUMN_ORDER` in `src/domain/model/column.ts` lines 18–28: `QA → DOD_GATE → DONE` | ✅ |

### 2.2 Agent Roster Alignment

| Agent | Task Description | System Design §5.2 | Verdict |
|-------|-----------------|---------------------|---------|
| QA agent | "QA agent receives all prior artifacts, produces qa-report.md" | `qa-agent` — worker — DEPLOY — "Writes and runs automated tests" | ⚠️ |
| DOD_GATE agent | "DoD agent receives all artifacts + qa-report" | No named agent — §2.2 says "Human approval" | ⚠️ |

**Note on QA agent:** System design §5.2 describes the QA agent as "Writes and runs automated tests." The task and downstream AEOS-16 describe it as producing a quality assessment report. This is a known system design documentation gap (also flagged in REVIEW-20260408-M6-000, I-4). The task's interpretation is consistent with v1 scope — the report-based approach is correct for v1.

**Note on DOD_GATE agent:** System design §2.2 shows "Human approval" as the reviewer for DOD_GATE, but also shows a worker output (`SAAS-1-dod-verification.md`). The task correctly identifies that DOD_GATE has both an automated evaluation step (worker) and a human approval step. However, there is no `dod-agent` in the system design agent roster (§5.2). The design doc produced by this task must clarify whether DOD_GATE uses a dedicated agent or a repurposed reviewer-agent.

### 2.3 Context Scoping

| Phase | System Design §8.1 | Task Coverage | Verdict |
|-------|--------------------|--------------|---------|
| DEPLOY context | ticket.md + all artifacts + full codebase index + CONSTRAINTS.md | "all prior artifacts" / "all artifacts + qa-report" | ✅ |

### 2.4 System Design Section References

The task says "Validate the design against the system design document (Section 2.2, 5.2)."

System design section numbering is inconsistent (headings use `## 2`, `## 3` etc. but subsections use independent numbering like `### 5.2` under `## 6`). The references resolve to:
- §2.2 → "Artifact Produced Per Column" (under heading `## 2. Pipeline Architecture`) ✅
- §5.2 → "Agent Roster" (under heading `## 6. Agent and Prompt Library`) ✅

Both are the correct sections to validate against.

---

## 3. Findings

### 🔴 MAJOR (F-1): Output path `.aeos/docs/deploy-phase-design.md` is not part of the standard project layout

**Task step 1:** _"Create `.aeos/docs/deploy-phase-design.md`"_

**Problem:** The `.aeos/` directory structure defined in system design §3.3 contains:
- `.git/`, `CONSTRAINTS.md`, `column-specs/`, `tickets/`

There is no `docs/` subdirectory in the `.aeos/` layout. No other task creates files in `.aeos/docs/`.

Since AEOS-15 is a dogfood ticket running through the pipeline, its output should follow the standard artifact convention. The design document would be produced as a pipeline artifact in `.aeos/tickets/AEOS-15/` with the ticket-ID prefix, e.g. `AEOS-15-deploy-phase-design.md`.

If the intent is for the design doc to be a standalone reference (not a pipeline artifact), it should live in the project's own `docs/` directory (e.g. `docs/deploy-phase-design.md`), not in `.aeos/docs/`.

**Recommendation:** Change the output path to one of:
- `.aeos/tickets/AEOS-15/AEOS-15-deploy-phase-design.md` (if pipeline artifact — consistent with dogfood model)
- `docs/deploy-phase-design.md` (if standalone reference doc — accessible without `.aeos/`)

### 🔴 MAJOR (F-2): Design deliverables do not address the DOD_GATE column spec gap

**Problem:** The M6-000 review (I-1) identified that no task exists to create `.aeos/column-specs/dod-gate.yaml`. The loader mapping already exists (`[Column.DOD_GATE]: 'dod-gate'` at `yaml-column-spec-loader.adapter.ts` line 21), but no task creates the actual YAML file. Downstream tasks depend on it:

- M6-005 (AEOS-19): DoD says "Rubric path added to `dod-gate.yaml` column spec under `reviewerRubrics`"
- M6-006 (AEOS-20): Implements `aeos ticket dod-approve` which transitions from DOD_GATE → DONE

**The AEOS-15 design is the correct place to resolve this.** The design must specify:
1. Whether DOD_GATE uses a standard column spec (with worker agent + reviewer agent) or a special-case workflow (human-only, like BACKLOG)
2. If DOD_GATE needs a column spec, what its content is (worker agent, escalation, advance mode)
3. If DOD_GATE does NOT need a column spec, M6-005's DoD must be updated to remove the `dod-gate.yaml` reference

**Recommendation:** Add explicit design deliverable: "Specify whether DOD_GATE requires a `dod-gate.yaml` column spec. If yes, define its contents and create a task (M6-000b). If no, document the alternative and flag M6-005/M6-006 for amendment."


### ⚠️ MEDIUM (F-3): Acceptance criteria missing key design decisions

**Task AC:**
- `deploy-phase-design.md` exists
- QA column workflow fully specified
- DOD_GATE column workflow fully specified
- State transitions consistent with `StateMachineService`

**Missing AC for design completeness:**
1. No AC for specifying what happens on **QA rejection** — the task's "What needs to be done" §1 mentions "Error flows: what happens when QA rejects, when DoD evaluation fails" but the AC don't verify this.
2. No AC for specifying the **DOD_GATE agent identity** — is it a new `dod-agent`, a repurposed `reviewer-agent`, or no agent at all?
3. No AC for **DOD_GATE column spec decision** (see F-2).
4. No AC for specifying **QA reviewer rubric configuration** (which rubrics go in `qa.yaml`'s `reviewerRubrics` array — already stubbed as empty in M6-000).
5. No AC for specifying the **DOD_GATE sub-state lifecycle** — what sub-states does DOD_GATE use? Standard WORKING → IN_REVIEW → SIGNED_OFF? Or a special human-gate sub-state?

**Recommendation:** Add AC:
- "Error flows specified for QA rejection and DoD evaluation failure (sendback targets defined)"
- "DOD_GATE agent identity specified (new agent, reviewer-agent, or human-only)"
- "DOD_GATE column spec decision documented (needed or not; if needed, contents specified)"

### ⚠️ MEDIUM (F-4): Sub-state compatibility with DOD_GATE not addressed

**Problem:** The `SubState` enum (`src/domain/model/sub-state.ts`) defines seven sub-states:
```
READY, BLOCKED, WORKING, INTERRUPTED, FAILED, IN_REVIEW, SIGNED_OFF
```

For the DOD_GATE column, the workflow described in the task is:
1. DoD agent runs (WORKING)
2. DoD agent produces `dod-evaluation` (→ IN_REVIEW? → SIGNED_OFF?)
3. Human approval gate

The system design §2.1 says DOD_GATE reviewer is "human". This means the standard review cycle (WORKING → IN_REVIEW → SIGNED_OFF via reviewer agent) may not apply. The design must specify how human approval maps to existing sub-states:
- Does SIGNED_OFF mean "DoD agent done" or "human approved"?
- Is there a new sub-state needed (e.g. `AWAITING_APPROVAL`)?
- Or does SIGNED_OFF serve double duty (automated sign-off in other columns, human sign-off in DOD_GATE)?

The `ticket-dod-approve.use-case.ts` stub already exists (2 lines, essentially empty) and M6-006 specifies: "On Y: `transition(db, id, 'DONE')`, `setSubState(db, id, 'SIGNED_OFF')`". This implies SIGNED_OFF is set at human approval time. But the design doc should make this explicit.

**Recommendation:** Add to design deliverables: "Specify DOD_GATE sub-state lifecycle and how it differs from standard column sub-state flow."

### ⚠️ MEDIUM (F-5): Dependency "M5b complete" is correct but incomplete

**Problem:** The listed dependency is "M5b complete". This is functionally correct — the pipeline needs to support CODE_REVIEW for AEOS-15 to run through the pipeline as a dogfood ticket. However:

1. **M6-000 (qa.yaml column spec) is not listed as a dependency.** M6-000 is archived, implying it's already done. Since AEOS-15 is a design task that runs through PLAN/PREPARE/BUILD columns (not the QA column), it doesn't technically need `qa.yaml` to exist. ✅ Correct — not a real dependency.

2. **No explicit mention that AEOS-15 runs as a pipeline ticket.** The action plan says "Treat this design work as AEOS-15 (a ticket through the pipeline, not a manual task)." The task header says "Method: Agentic implementation" — consistent. But the task body doesn't mention which pipeline columns AEOS-15 passes through. Since it produces a design document (not code), it likely runs through PRODUCT_SCOPING → ARCH_SPIKE → TECH_SPEC at most. The "What needs to be done" section reads like a manual task spec, not like acceptance criteria for a pipeline-produced artifact.

**Recommendation:** Add a note clarifying that AEOS-15 is a dogfood ticket and specify which columns it traverses (likely BACKLOG → PRODUCT_SCOPING → ARCH_SPIKE at minimum).

---

## 4. Dependencies Audit

| Dependency | Status | Verified |
|-----------|--------|----------|
| M5b complete | Assumed complete (pipeline supports CODE_REVIEW) | ⚠️ Not verified against implementation |

**Missing dependencies:** None that block AEOS-15 directly. The task is a design document that runs through PLAN/PREPARE columns, which are available from M4 onward. M5b is a conservative dependency.

**Considered and accepted:**
- M6-000 (qa.yaml): Not a dependency — AEOS-15 doesn't run in the QA column. ✅
- M2-011 (`aeos ticket run`): Already complete — needed for dogfood execution. ✅

---

## 5. File Path Alignment with Hexagonal Scaffold

This task produces a design document, not source code. File path alignment with `src/` is not directly applicable. However, the design document's content should reference the correct source paths:

| Referenced Concept | Source Path | Exists | Notes |
|-------------------|------------|--------|-------|
| `StateMachineService` | `src/domain/services/state-machine.ts` | ✅ | Referenced in AC |
| `Column.QA` | `src/domain/model/column.ts` line 10 | ✅ | |
| `Column.DOD_GATE` | `src/domain/model/column.ts` line 11 | ✅ | |
| `Column.DONE` | `src/domain/model/column.ts` line 12 | ✅ | |
| `COLUMN_ORDER` | `src/domain/model/column.ts` lines 18–28 | ✅ | QA → DOD_GATE → DONE in order |
| `SubState` enum | `src/domain/model/sub-state.ts` | ✅ | 7 sub-states defined |
| `ColumnSpec` interface | `src/domain/model/column-spec.ts` | ✅ | |
| `ColumnSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` | ✅ | |
| DOD_GATE loader mapping | `yaml-column-spec-loader.adapter.ts` line 21 | ✅ | `[Column.DOD_GATE]: 'dod-gate'` |
| `ticket-dod-approve.use-case.ts` | `src/application/ticket-dod-approve.use-case.ts` | ✅ | Stub only (2 lines) |

**Output path issue:** `.aeos/docs/deploy-phase-design.md` — see F-1. The `docs/` subdirectory does not exist in the `.aeos/` structure and is not created by any task.

---

## 6. Consistency with Reviewed Sibling Tasks

### 6.1 Comparison with M6-002 through M6-006

| Aspect | M6-002 | M6-003 | M6-004 | M6-005 | M6-006 | **M6-001** |
|--------|--------|--------|--------|--------|--------|------------|
| Has Layer Mapping | — | — | — | — | ✅ | — (design doc, N/A) |
| Has file path in AC | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| References AEOS-15 as dep | ✅ | — | — | — | — | N/A (is AEOS-15) |
| Specifies agent to use | prompt-eng | prompt-eng | prompt-eng | prompt-eng | ts-pro | backend-architect |
| Out of Scope clear | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 6.2 Downstream Dependency Chain

```
M6-001 (AEOS-15) ← design
  └→ M6-002 (AEOS-16) ← qa-agent.yaml (depends on M6-001)
       └→ M6-003 (AEOS-17) ← qa-report-template.md (depends on M6-002)
            └→ M6-004 (AEOS-18) ← qa-report-structure.md rubric (depends on M6-003)
                 └→ M6-005 (AEOS-19) ← dod-evaluation.md rubric (depends on M6-004)
                      └→ M6-006 (AEOS-20) ← dod-approve CLI (depends on M6-005)
```

The chain is linear and correctly ordered. Each task depends on its predecessor. ✅

**Gap:** No task creates `dod-gate.yaml` column spec. M6-005 and M6-006 reference it but it doesn't exist and no task produces it. The design from AEOS-15 must resolve this. See F-2.

---

## 7. Informational Notes

### ℹ️ INFO (I-1): ContextAssembler does not yet have column-aware context scoping

`ContextAssembler.assemble()` currently has signature:
```typescript
async assemble(ticketId: string, projectRoot: string): Promise<AssembledContext>
```

M5b-002 (AEOS-14, diff injection) adds a `column` parameter. The DEPLOY phase design should account for QA-specific context assembly (e.g., injecting all BUILD artifacts + code diff into QA context). The `AssembledContext` interface currently lacks `codeDiff` — this is added by M5b-002.

The design doc should not assume these changes are in place until M5b is complete (which is listed as a dependency). ✅ Consistent.

### ℹ️ INFO (I-2): DOD_GATE loader test expects ColumnSpecNotFoundError but loader mapping exists

`yaml-column-spec-loader.adapter.test.ts` line 75:
```typescript
it('throws ColumnSpecNotFoundError for DOD_GATE column', () => {
  expect(() => loader.load(Column.DOD_GATE, tmpDir)).toThrow(ColumnSpecNotFoundError);
});
```

The `COLUMN_SPEC_FILENAMES` mapping now includes `[Column.DOD_GATE]: 'dod-gate'` (line 21). This test throws `ColumnSpecNotFoundError` because the file doesn't exist in the temp dir — not because the mapping is missing. When `dod-gate.yaml` is created, this test will need to be updated or removed. The AEOS-15 design should note this as a downstream implementation detail.

### ℹ️ INFO (I-3): Action plan explicitly calls out DEPLOY columns as "partially designed"

Action plan §M6: _"Design prerequisite: DEPLOY columns are partially designed as of plan authoring. Before running M6 tickets, complete the DEPLOY column design."_

Action plan Open Decisions: _"DEPLOY columns (QA → DoD Gate): Partially designed. Complete before M6 via AEOS-15 (a dogfood ticket)."_

System design §2.1 note: _"DEPLOY columns are the least defined — needs further design in a later iteration."_

All three sources agree that AEOS-15 is the right vehicle for this design work. ✅

---

## 8. Gaps That Would Block Implementation

### 8.1 Blocking gaps (must resolve before AEOS-15 can execute)

**None.** AEOS-15 is a design task that produces a document. It can execute as a dogfood ticket through PLAN/PREPARE columns immediately, assuming M5b is complete.

### 8.2 Blocking gaps (design output must address to unblock M6-002+)

1. **DOD_GATE column spec decision (F-2):** Without this, M6-005 and M6-006 cannot be implemented as written.
2. **DOD_GATE sub-state lifecycle (F-4):** Without this, M6-006's transition logic is ambiguous.
3. **DOD_GATE agent identity:** Without this, M6-005 doesn't know where to configure the rubric.

### 8.3 Non-blocking gaps

1. **Output path (F-1):** Does not block execution, but the artifact will be in a non-standard location.
2. **Acceptance criteria (F-3):** Does not block execution, but may result in an incomplete design.

---

## 9. Recommendations

### Required Changes

1. **Fix F-1:** Change output path from `.aeos/docs/deploy-phase-design.md` to either `.aeos/tickets/AEOS-15/AEOS-15-deploy-phase-design.md` (pipeline artifact) or `docs/deploy-phase-design.md` (standalone reference).

2. **Fix F-2:** Add explicit design deliverable: "Specify whether DOD_GATE requires a `dod-gate.yaml` column spec. If yes, define its contents. If no, document the alternative and update M6-005/M6-006 DoD."

3. **Fix F-3:** Add acceptance criteria:
   - "Error flows specified for QA rejection and DoD evaluation failure"
   - "DOD_GATE agent identity specified"
   - "DOD_GATE column spec decision documented"
   - "DOD_GATE sub-state lifecycle specified"

4. **Fix F-4:** Add to design scope: "Specify DOD_GATE sub-state lifecycle."

### Suggested Changes

5. **Fix F-5:** Add note: "AEOS-15 runs as a dogfood ticket through BACKLOG → PRODUCT_SCOPING → ARCH_SPIKE." (Clarifies pipeline traversal for implementer.)

6. **Cross-task:** After AEOS-15 design is complete, create `M6-000b-dod-gate-column-spec.md` if the design determines DOD_GATE needs a column spec. Insert it in the dependency chain before M6-005.

7. **Cross-task:** Update the DOD_GATE loader test (`yaml-column-spec-loader.adapter.test.ts` line 75) when `dod-gate.yaml` is eventually created.