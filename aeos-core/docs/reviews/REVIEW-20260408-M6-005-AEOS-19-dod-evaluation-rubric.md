# Review: M6-005 — AEOS-19 DoD Evaluation Rubric (`dod-evaluation.md`)

**Reviewed:** 2026-04-08
**Task file:** `docs/tasks/M6-005-AEOS-19-dod-evaluation-rubric.md`
**Reviewer:** Augment Agent (automated deep review)
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling rubric tasks: M3-002 (prd-structure), M3-004 (intent-drift), M4-003 (tech-spec-structure), M5a-003 (impl-structure), M5b-001 (code-structure), M6-004 (qa-structure)
- Same-milestone tasks: M6-001 (AEOS-15 deploy design), M6-002 (AEOS-16 qa-agent), M6-003 (AEOS-17 qa-report-template), M6-004 (AEOS-18 qa-structure-rubric), M6-006 (AEOS-20 dod-gate-cli)
- Column spec scaffolding: M2-015 (scaffold column specs on init)
- Prior reviews: REVIEW-20260408-M6-000, REVIEW-20260408-M6-001, REVIEW-20260408-M6-002, REVIEW-20260408-M6-003, REVIEW-20260408-M6-004
- Source code: `src/domain/model/column.ts`, `src/domain/model/column-spec.ts`, `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts`, `src/infrastructure/spec-loader/schemas.ts`, `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`, `src/application/ticket-dod-approve.use-case.ts`

---

## 1. Verdict: ⛔ APPROVE WITH REQUIRED CHANGES

One critical issue (blocking), two major issues, three medium issues, and three minor issues. The task is correctly scoped to the system design's rubric library (§5.3 explicitly names `dod/dod-evaluation.md`), and the binary PASS/FAIL format is a correct and intentional departure from other rubrics' PASS/WARN/FAIL format — DoD is holistic and binary by design. However, a critical dependency gap on the `dod-gate.yaml` column spec blocks step 5 and the Definition of Done.

---

## 2. Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Artifact name | `dod-evaluation.md` | §5.3: `dod-evaluation.md` in `rubrics/dod/` | ✅ Exact match |
| Rubric path | `.aeos/rubrics/dod/dod-evaluation.md` | §5.3: `dod/dod-evaluation.md` | ✅ Correct directory |
| Rubric purpose | "holistic DoD evaluation — final automated quality check" | §5.3: `dod-evaluation.md` — "full DoD evaluation (DoD Gate only)" | ✅ Match |
| Column | DOD_GATE | §2.1: "DoD Gate" in DEPLOY phase | ✅ Match |
| Binary format | PASS/FAIL only (no WARN) | §2.2: DoD Gate reviewer = "Human approval" — binary decision | ✅ Correct |
| Column spec update | Add to `dod-gate.yaml` `reviewerRubrics` | §5.4: column specs define rubric references | ⛔ See C1 |
| Criteria scope | Artifact completeness, reviewers approved, QA READY, no open questions, intent match | §2.2: DoD Gate = "All artifacts + ticket DoD" → `dod-verification.md` + Human approval | ✅ Covers expected scope |
| Artifact list | ticket, PRD, spike, tech-spec, impl-notes, code-review, qa-report | §2.2 worker outputs per column: ticket.md, prd.md, spike.md, tech-spec.md, implementation-notes.md, code-review.md, qa-report.md | ⚠️ See M3 |
| ≥5 criteria | 5 listed in task description | Not specified in system design | ✅ Consistent with sibling pattern |

**System design alignment is correct** for the rubric itself. The binary PASS/FAIL format is an intentional and appropriate departure from the three-level PASS/WARN/FAIL used by column rubrics — the DoD Gate is a final go/no-go check, not an iterative improvement loop.

---

## 3. Findings

### ⛔ CRITICAL (C1): `dod-gate.yaml` column spec does not exist — step 5 and DoD are unachievable

**Task step 5:** _"Add rubric path to `dod-gate.yaml` column spec under `reviewerRubrics`"_
**Task DoD:** _"Rubric path added to `dod-gate.yaml` column spec under `reviewerRubrics`"_

**Problem:** The file `.aeos/column-specs/dod-gate.yaml` does **not exist** on disk. Verified: only 6 column specs exist (`product-scoping.yaml`, `architecture-spike.yaml`, `tech-spec.yaml`, `implementation.yaml`, `code-review.yaml`, `qa.yaml`). No `dod-gate.yaml`.

The `COLUMN_SPEC_FILENAMES` mapping includes `[Column.DOD_GATE]: 'dod-gate'` (line 21 of `yaml-column-spec-loader.adapter.ts`), so the loader *would* resolve it — but the file itself was never created. No task in `docs/tasks/` creates it:

- M2-015 (scaffold column specs on init) includes DOD_GATE in its spec table with a TODO comment noting "DOD_GATE uses human-approval flow (AEOS-20), not agent execution". But the scaffolding was apparently not executed for the dev project, or DOD_GATE was excluded.
- M6-000 (qa column spec) only creates `qa.yaml`.
- M6-001 review (F-2, MAJOR) explicitly flagged this: _"No task exists to create `.aeos/column-specs/dod-gate.yaml`... create M6-000b"_.
- M6-000 review (I-1) also flagged it.

**Impact:** Step 5 and the second DoD criterion cannot be completed. The implementer will encounter a missing file.

**Recommendation:** One of:
1. **Create a new task `M6-000b-dod-gate-column-spec.md`** following the M6-000 pattern, and add it as a dependency for M6-005. This is the cleanest fix.
2. **Add a step to M6-005** to create `dod-gate.yaml` inline before adding the rubric path. Less clean — mixes concerns.
3. **If AEOS-15 design determines DOD_GATE is human-only with no column spec**, remove step 5 and the corresponding DoD criterion, and document how M6-006 (`ticket-dod-approve`) locates the rubric without a column spec (e.g., hardcoded path or config).

### 🔴 MAJOR (F-1): Dependency is incorrect — lists M6-004 instead of dod-gate column spec

**Listed dependency:** _"M6-004: AEOS-18 complete"_

**Problem:** M6-004 produces `qa-report-structure.md` — the QA column's reviewer rubric. The DoD evaluation rubric does **not** depend on the QA structure rubric:
- The DoD rubric checks "QA recommendation is READY FOR DOD" — this depends on the QA *report* existing, not on the QA *rubric* existing.
- The DoD rubric checks "all column reviewers approved" — this is a pipeline state check, not a rubric content dependency.
- The rubric criteria are self-contained and can be authored independently.

The actual dependency is the `dod-gate.yaml` column spec (see C1) — the task needs the column spec file to update its `reviewerRubrics` array.

Every amended sibling rubric task lists its column spec as the dependency:
- M3-002: `M3-000: product-scoping.yaml`
- M5a-003 (amended): `M5a-000: implementation.yaml`
- M5b-001 (amended): `M5b-000: code-review.yaml`
- M6-004 (amended): `M6-000: qa.yaml`

**Recommendation:** Replace with:
```markdown
## Dependencies
- M6-000b: `dod-gate.yaml` column spec exists (provides `reviewerRubrics` array to update)
```
Or, if no M6-000b task is created, replace with whatever mechanism provides the rubric path storage.

### 🔴 MAJOR (F-2): Architectural ambiguity — how does `ticket-dod-approve` consume the rubric?

**Problem:** The task adds the rubric path to `dod-gate.yaml` under `reviewerRubrics`. But M6-006 (`ticket-dod-approve`) specifies: _"Load DoD rubric from `dod-evaluation.md`, display as checklist."_

In standard columns, `reviewerRubrics` are loaded by the `TicketRunUseCase` and injected into the reviewer agent's prompt. But DOD_GATE's "reviewer" is human — the rubric is displayed by the CLI command, not processed by an agent.

Two contradictory consumption patterns exist:
1. **M6-005 (this task):** Rubric path goes in `reviewerRubrics` of `dod-gate.yaml` — implies the standard reviewer pipeline reads it.
2. **M6-006 (dod-approve CLI):** Loads rubric directly from `dod-evaluation.md` — implies a hardcoded or separately configured path.

If the `ticket-dod-approve` use case loads from `reviewerRubrics` in the column spec, that's consistent but means the column spec must exist. If it loads the rubric by a hardcoded path, then putting the path in `reviewerRubrics` is cosmetic — it won't be read by any code.

**Recommendation:** The AEOS-15 design (M6-001) must resolve this. Until then, add a note to M6-005: _"Confirm with AEOS-15 design output how `ticket-dod-approve` locates the DoD rubric — via `dod-gate.yaml` `reviewerRubrics` or via a dedicated configuration path."_


### ⚠️ MEDIUM (M1): Missing prerequisite — `.aeos/rubrics/dod/` directory not scaffolded

**Problem:** The task writes to `.aeos/rubrics/dod/dod-evaluation.md`, but no existing task or `ProjectInitUseCase` creates the `rubrics/` or `rubrics/dod/` directories. Verified: `.aeos/rubrics/dod/` does **not exist** on disk.

This is the same recurring gap flagged in every prior rubric task review:
- F-1 (MEDIUM) in M3-002 review → **amended with mkdir step**
- M1 (MEDIUM) in M4-003 review
- M1 (MEDIUM) in M5a-003 review → **amended with mkdir step**
- M1 (MEDIUM) in M5b-001 review → **amended with mkdir step**
- M1 (MEDIUM) in M6-004 review → **amended with mkdir step**

The `FsRubricLoader` (`src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`) reads from `.aeos/{rubricPath}` and returns `null` on ENOENT — it does not create directories.

**Impact:** The implementer must manually `mkdir -p .aeos/rubrics/dod/` before writing the rubric file. Fragile for automated (agentic) execution.

**Recommendation:** Add step 0 per the amended sibling pattern: _"Ensure `.aeos/rubrics/dod/` directory exists (create it if it does not)"_

### ⚠️ MEDIUM (M2): Missing validation acceptance criterion

**Task step 4:** _"Validate against a hypothetical incomplete pipeline run to confirm it catches the gap"_
**Acceptance criteria:** No corresponding checkbox.

All amended sibling rubric tasks include a validation AC:
- M3-002: `- [ ] Validated against a hypothetical bad PRD — at least one criterion triggers WARN or FAIL`
- M5a-003 (amended): `- [ ] Validated against a hypothetical incomplete implementation plan`
- M5b-001 (amended): `- [ ] Validated against a hypothetical sloppy code review`
- M6-004 (amended): `- [ ] Validated against a hypothetical bad QA report`

The task description mentions validation (step 4) but the AC section doesn't include it.

**Recommendation:** Add to Acceptance Criteria:
```markdown
- [ ] Validated against a hypothetical incomplete pipeline run (e.g. missing QA report, unresolved reviewer FAIL) — at least one criterion triggers FAIL
```

### ⚠️ MEDIUM (M3): Artifact list in criteria is incomplete vs system design

**Task step 2:** _"all required artifacts present (ticket, PRD, spike, tech-spec, impl-notes, code-review, qa-report)"_

**System design §2.2 full artifact list per column (worker + reviewer outputs):**
- Backlog: `ticket.md`
- Product Scoping: `prd.md` + `prd-review.md`
- Architecture Spike: `spike.md` + `spike-review.md`
- Tech Spec: `tech-spec.md` + `spec-review.md`
- Implementation: `implementation-notes.md` + `impl-review.md`
- Code Review: `code-review.md` + `code-review-signoff.md`
- QA: `qa-report.md` + `qa-signoff.md`

**Gaps:**
1. The task lists 7 artifacts but system design shows 14 (7 worker + 7 reviewer). The DoD checklist should decide whether reviewer sign-off artifacts are required or only worker artifacts.
2. The task uses `impl-notes` — system design uses `implementation-notes.md`. Minor naming inconsistency.
3. The `questions.md` artifact (from pre-flight pass) is not mentioned.

**Recommendation:** Clarify in the criteria description: _"all required worker artifacts present (ticket, prd, spike, tech-spec, implementation-notes, code-review, qa-report); optionally verify reviewer sign-off artifacts exist for each column"_

---

## 4. Minor Issues

### m1: Method header inconsistent with action plan

**Task header:** `Method: Agentic implementation`
**Action plan §M6:** _"Method: Dogfood."_ — All M6 tickets are listed as dogfood tickets.

Pattern check across sibling tasks:
- M6-002: `Dogfood — run through AEOS pipeline` ✅
- M6-003: `Dogfood — run through AEOS pipeline` ✅
- M6-004: `Agentic implementation` ❌ (flagged in M6-004 review, m1)
- **M6-005: `Agentic implementation`** ❌

**Recommendation:** Change to `Method: Dogfood — run through AEOS pipeline` per action plan.

### m2: Agent field "prompt-engineering" is not a recognized agent spec

**Task header:** `Agent: prompt-engineering`

Not in the system design §5.2 roster. Used as a task classification label. Same pattern as M6-004. Cosmetic — no action required.

### m3: Out of Scope references only AEOS-20 — could also note AEOS-15 design boundary

**Task:** `Out of Scope: DoD Gate CLI command (AEOS-20)`

The task correctly excludes AEOS-20 but doesn't note that DOD_GATE workflow design decisions are owned by AEOS-15. Since AEOS-15's design output directly affects how the rubric is consumed, a note would help: _"DOD_GATE workflow design is owned by AEOS-15. This task produces the rubric content only."_

**Impact:** Low — task scope is clear enough from context.

---

## 5. File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Notes |
|----------------------------|-----------------|-------|
| `ColumnSpec.reviewerRubrics` | `src/domain/model/column-spec.ts` line 11 | ✅ `readonly reviewerRubrics: string[]` |
| `ColumnSpecSchema.reviewerRubrics` | `src/infrastructure/spec-loader/schemas.ts` line 14 | ✅ `z.array(z.string()).default([])` |
| `FsRubricLoader` | `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts` | ✅ Reads `.aeos/{rubricPath}`, returns `null` on ENOENT |
| `RubricLoader` port | `src/domain/ports/driven/rubric-loader.port.ts` | ✅ |
| `Column.DOD_GATE` | `src/domain/model/column.ts` line 11 | ✅ `DOD_GATE: 'DOD_GATE'` |
| DOD_GATE loader mapping | `yaml-column-spec-loader.adapter.ts` line 21 | ✅ `[Column.DOD_GATE]: 'dod-gate'` |
| `dod-gate.yaml` on disk | `.aeos/column-specs/dod-gate.yaml` | ⛔ **Does not exist** — see C1 |
| `.aeos/rubrics/dod/` directory | — | ⛔ **Does not exist** — see M1 |
| `ticket-dod-approve.use-case.ts` | `src/application/ticket-dod-approve.use-case.ts` | ⚠️ Stub (2 lines, empty) |

---

## 6. Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| Listed: M6-004 (AEOS-18, `qa-report-structure.md`) | ⬜ Not yet complete | Task file in `docs/tasks/` (not archived) |
| Actual: dod-gate column spec | ⛔ Does not exist | No file on disk; no task creates it |
| Implicit: M6-001 (AEOS-15, deploy design) | ⬜ Not yet complete | Must resolve DOD_GATE column spec and rubric consumption pattern |

**Transitive dependency chain (as designed):**
```
M6-001 (AEOS-15 design) → resolves DOD_GATE column spec decision
  └→ [M6-000b] (dod-gate.yaml) → creates the column spec file [MISSING TASK]
       └→ M6-005 (AEOS-19, this task) → creates rubric, adds path to column spec
            └→ M6-006 (AEOS-20) → CLI command loads rubric and displays to human
```

**Key dependency gap:** No task creates `dod-gate.yaml`. The M6-001 review (F-2) recommended creating `M6-000b-dod-gate-column-spec.md`. This has not been done.

---

## 7. Consistency with Sibling Rubric Tasks

| Aspect | M3-002 (amended) | M5a-003 (amended) | M5b-001 (amended) | M6-004 (amended) | **M6-005 (dod)** |
|--------|------------------|--------------------|--------------------|-------------------|-----------------|
| Method | Dogfood ✅ | Dogfood ✅ | Dogfood ✅ | ❌ Agentic | ❌ Agentic |
| mkdir step | ✅ | ✅ | ✅ | ✅ | ❌ Missing |
| Validation AC | ✅ | ✅ | ✅ | ✅ (partial) | ❌ Missing |
| Criteria count | 5 | 5 | 6 | 5 | 5 |
| Dep = column spec | ✅ (M3-000) | ✅ (M5a-000) | ✅ (M5b-000) | ✅ (M6-000) | ❌ (M6-004) |
| Criteria format | PASS/WARN/FAIL | PASS/WARN/FAIL | PASS/WARN/FAIL | PASS/WARN/FAIL | PASS/FAIL ✅ (intentional) |

**Key observation:** The PASS/FAIL-only format is the correct intentional departure for the DoD rubric. All other gaps (mkdir, validation AC, dependency, method) are patterns fixed in sibling reviews but not propagated to M6-005.

---

## 8. Cross-Task Coordination Issues

### X1: M6-006 rubric loading path ambiguity

M6-006 step 1: _"Load DoD rubric from `dod-evaluation.md`, display as checklist"_

This implies the CLI command loads the rubric directly by path — not via `reviewerRubrics` in the column spec. If this is the design intent, then adding the rubric path to `dod-gate.yaml` `reviewerRubrics` is for consistency/documentation only and is not functionally consumed.

If `ticket-dod-approve` should read from the column spec's `reviewerRubrics`, M6-006 needs updating to: _"Load column spec for DOD_GATE, read `reviewerRubrics[0]`, load rubric, display as checklist."_

**Recommendation:** Align M6-005 and M6-006 on the rubric loading mechanism. AEOS-15 design should resolve this.

### X2: M6-004 → M6-005 dependency chain

M6-004 review (X2) confirmed: _"M6-005 rubric criterion includes 'QA recommendation is READY FOR DOD' — which relies on the recommendation consistency check defined in M6-004."_

However, the dependency is **conceptually correct but operationally wrong**. The DoD rubric checks that the QA recommendation exists and says READY — it doesn't need the QA *structure rubric* to exist. The actual operational dependency is the column spec file.

### X3: M2-015 scaffolding gap

M2-015 includes DOD_GATE in its spec table (`dod-gate.yaml`) but the file was not created on disk. Only 6 of 7 column specs exist. Either M2-015 was not fully executed for the dev project, or DOD_GATE was intentionally excluded from scaffolding. If running `aeos project init` again would scaffold all 7, no new task is needed — just re-run init.

---

## 9. Gaps That Would Block Implementation

### 9.1 Blocking gaps

1. **C1 (CRITICAL):** `dod-gate.yaml` does not exist. Step 5 and the second DoD criterion cannot be completed. **Resolution required:** Either create the column spec file (new task M6-000b or inline step) or remove the column spec update from scope.

### 9.2 Non-blocking but important

2. **F-1 (MAJOR):** Wrong dependency (M6-004 instead of dod-gate column spec). Creates false ordering constraint and masks the real dependency gap.
3. **F-2 (MAJOR):** Architectural ambiguity on rubric consumption pattern. Does not block writing the rubric, but blocks integration with M6-006.
4. **M1 (MEDIUM):** `.aeos/rubrics/dod/` directory does not exist. Known workaround (mkdir) but fragile for agentic execution.
5. **M2 (MEDIUM):** Missing validation AC. Does not block implementation but weakens quality assurance.
6. **M3 (MEDIUM):** Incomplete artifact list. Does not block but may result in a rubric that misses reviewer artifacts.

---

## 10. Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| C1 | Critical | `dod-gate.yaml` does not exist — step 5 unachievable | Create `M6-000b-dod-gate-column-spec.md` task; add as dependency |
| F-1 | Major | Dependency M6-004 is wrong — should be dod-gate column spec | Replace dependency with dod-gate column spec task |
| F-2 | Major | Rubric consumption ambiguity (column spec vs hardcoded path) | Resolve in AEOS-15 design; add note to task |
| M1 | Medium | `.aeos/rubrics/dod/` not scaffolded | Add mkdir step per amended sibling pattern |
| M2 | Medium | Missing validation AC | Add validation AC per amended sibling pattern |
| M3 | Medium | Artifact list incomplete (missing reviewer artifacts) | Clarify worker-only vs full artifact set in criteria |
| m1 | Minor | Method "Agentic implementation" ≠ action plan "Dogfood" | Align to `Dogfood — run through AEOS pipeline` |
| m2 | Minor | Agent "prompt-engineering" not in agent roster | Cosmetic — no action required |
| m3 | Minor | Out of Scope doesn't note AEOS-15 design boundary | Add clarifying note |
| X1 | Cross-task | M6-006 rubric loading path ambiguity | Align with AEOS-15 design output |
| X2 | Cross-task | M6-004 dependency is conceptual not operational | Replace with column spec dependency |
| X3 | Cross-task | M2-015 scaffolding gap for DOD_GATE | Verify scaffolding status; create file if missing |

---

## 11. Proposed Amendments

### 1. Create prerequisite task (C1, F-1)

Create `docs/tasks/M6-000b-dod-gate-column-spec.md` following the M6-000 (`qa.yaml`) pattern:
```yaml
column: DOD_GATE
phase: DEPLOY
workerAgentFile: agents/qa-agent.yaml       # placeholder — DOD_GATE is human-controlled
reviewerAgentFile: agents/reviewer-agent.yaml  # placeholder
outputArtifact: dod-verification.md
minWordCount: 50
requiredSections: []
reviewerRubrics: []
maxIterations: 1
escalation: escalate_to_human
advanceMode: manual
preflight:
  enabled: false
  questionsArtifact: questions.md
# TODO: DOD_GATE uses human-approval flow (AEOS-20), not standard agent execution
```

### 2. Add mkdir step (M1)

Add as new step 0, renumber subsequent steps:
```markdown
0. Ensure `.aeos/rubrics/dod/` directory exists (create it if it does not)
```

### 3. Fix dependencies (F-1)

```markdown
## Dependencies
- M6-000b: `dod-gate.yaml` column spec exists (provides `reviewerRubrics` array to update)
- M6-001: AEOS-15 complete (confirms DOD_GATE rubric consumption pattern)
```

### 4. Add validation AC (M2)

Add to Acceptance Criteria:
```markdown
- [ ] Validated against a hypothetical incomplete pipeline run (e.g. missing QA report, unresolved reviewer FAIL) — at least one criterion triggers FAIL
```

### 5. Update Method header (m1)

```markdown
**Method:** Dogfood — run through AEOS pipeline
```

### 6. Add architectural note (F-2)

Add to task body:
```markdown
## Technical Notes / Hints
- Confirm with AEOS-15 design output how `ticket-dod-approve` (M6-006) locates the DoD rubric —
  via `dod-gate.yaml` `reviewerRubrics` or via a dedicated configuration path.
- The `dod-gate.yaml` column spec is a placeholder for the human-controlled DOD_GATE column.
  `workerAgentFile` and `reviewerAgentFile` are required by `ColumnSpecSchema` but are not
  used by the human-approval flow.
```

---

## 12. Summary

| Category | Count |
|----------|-------|
| Critical | 1 |
| Major | 2 |
| Medium | 3 |
| Minor | 3 |
| Cross-task | 3 (0 confirmed-OK, 3 require coordination) |

**Overall:** The DoD evaluation rubric is correctly identified in the system design (§5.3 `dod/dod-evaluation.md`), correctly scoped as holistic and binary (PASS/FAIL only), and correctly positioned as the final automated quality check before human approval. The five listed criteria (artifact completeness, reviewer approvals, QA recommendation, no open questions, intent match) cover the essential DoD evaluation dimensions.

The critical blocker is the missing `dod-gate.yaml` column spec — step 5 and the second DoD criterion are unachievable without it. This gap was flagged in two prior reviews (M6-000 I-1, M6-001 F-2) but no task was created to address it. The recommended fix is to create `M6-000b-dod-gate-column-spec.md` and insert it in the dependency chain before M6-005.

Secondary issues follow the same patterns seen in prior rubric task reviews: missing mkdir step for the rubric directory, wrong dependency target (should be column spec, not prior ticket), missing validation acceptance criterion, and method header inconsistency with the action plan. All are addressable with task amendments following established patterns from M3-002, M5a-003, M5b-001, and M6-004 reviews.

The architectural ambiguity around rubric consumption (column spec `reviewerRubrics` vs direct path loading by `ticket-dod-approve`) is an open design question that should be resolved by the AEOS-15 design output (M6-001) before M6-005 is implemented. Until then, the task should note the ambiguity so the implementer does not make an incorrect assumption about where the rubric path is stored and read from.