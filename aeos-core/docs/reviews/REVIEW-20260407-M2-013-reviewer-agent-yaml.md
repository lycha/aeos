# Deep Review: M2-013 — Hand-Author `reviewer-agent.yaml`

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-013-reviewer-agent-yaml.md`
**Cross-referenced against:** System design (03-system-design.md §5.1–§5.6, §7.1), PRD (02-prd.md §5.4, §5.7), Action plan (05-action-plan-v1.md §M2–§M3), sibling tasks M2-007, M2-008, M2-011, M2-014, M3-001, existing scaffold in `src/`, prior reviews (M2-007, M2-008, M2-011, M2-012)

---

## Overall Assessment

The task correctly identifies M2-013 as a bootstrapping exception — the reviewer agent spec must be hand-authored because the pipeline doesn't exist yet to produce it. The context section, dependencies, and acceptance criteria are reasonable. The YAML structure aligns with the `AgentSpecSchema` defined in M2-007 (as amended by its review).

However, the task has **two major issues**, **three medium issues**, and **several minor observations**. The major issues involve a fundamental mismatch between the reviewer's finding model (PASS/WARN/FAIL per criterion) and the system design's finding model (INFO/WARNING/BLOCKER per finding), and ambiguity in the file storage location that would block M2-008 integration.

**Verdict:** Approve with required changes.

---

## 1. Correctness vs System Design

### ⚠️ MAJOR (GAP-1): Finding severity model misaligns with system design

The task's `taskInstruction` uses a **per-criterion rubric evaluation** model:
```
- PASS: if the artifact meets the criterion
- WARN: if the criterion is partially met (non-blocking)
- FAIL: if the criterion is not met (blocking)
Conclude with one of: APPROVED / APPROVED_WITH_WARNINGS / REJECTED
```

System design §5.6 (Review Cycle) uses a **per-finding severity** model:
```
INFO    — note, no action required
WARNING — should fix; accumulates toward max iterations
BLOCKER — must fix; always escalate to human
```

System design §5.5 (Reviewer Prompt Assembly) specifies:
```
Output findings tagged INFO / WARNING / BLOCKER.
```

PRD FR-05: "Reviewer returns findings tagged INFO / WARNING / BLOCKER."

**Differences:**
1. **Tag names:** PASS/WARN/FAIL (task) vs INFO/WARNING/BLOCKER (system design). These are not synonyms — PASS has no equivalent in the system design (only problems are tagged).
2. **Conclusion vocabulary:** APPROVED/APPROVED_WITH_WARNINGS/REJECTED (task) vs the state machine's SIGNED-OFF (system design §7.1). The M2-011 orchestration (step 13) uses `SIGNED_OFF` as the sub-state; it doesn't parse conclusion text.
3. **Semantic model:** The system design expects a list of *findings* (problems found), each with a severity tag. The task expects a *per-criterion evaluation table* (every criterion gets a row). These produce different output structures.

**Impact:** M2-011's orchestration (v1 simplification: step 13 "reviewer pass = automatic sign-off") doesn't parse the reviewer output — it just stores it. So this mismatch is **not blocking for M2**. However, from M3 onward, the review cycle (system design §5.6) routes findings by severity: WARNING → rework, BLOCKER → escalate. If the reviewer outputs PASS/WARN/FAIL instead of INFO/WARNING/BLOCKER, the parsing logic must be adapted or the reviewer must be rewritten. This creates tech debt.

**Recommendation:** Align the reviewer's output model with the system design. Change:
- `PASS` → omit (only list problems, not passing criteria)
- `WARN` → `WARNING`
- `FAIL` → `BLOCKER`
- `APPROVED` → keep (maps to no BLOCKERs, no WARNINGs)
- `APPROVED_WITH_WARNINGS` → keep (maps to WARNINGs only)
- `REJECTED` → keep (maps to any BLOCKER present)

Or adopt the system design's finding format directly in the `outputFormat`.

### ⚠️ MAJOR (GAP-2): File storage location ambiguous — blocks M2-008 integration

The task says:
> Create `.aeos/agents/reviewer-agent.yaml` (or `src/agents/reviewer-agent.yaml` if storing in source)

This "or" creates ambiguity. M2-008's `YamlAgentSpecLoader.load()` resolves agent files relative to `aeosDir()` (i.e., `.aeos/`). The column spec's `reviewerAgentFile` field (per M2-007 review amendment) stores a relative path like `agents/reviewer-agent.yaml`.

**Sub-problems:**
1. The system design §3.3 (Per-Project Layout) does not show an `agents/` directory under `.aeos/`. It shows `column-specs/` but no agent directory. This is a gap in the system design.
2. If the file goes in `src/agents/`, M2-008's loader cannot find it — `aeosDir()` points to `.aeos/`, not `src/`.
3. M3-001 says the output of AEOS-1 is `pm-agent.yaml` — but doesn't specify where it lives either.

**Impact:** M2-008's `loadAgentSpec('agents/reviewer-agent.yaml')` will fail with `AgentSpecNotFoundError` if the file doesn't exist at `.aeos/agents/reviewer-agent.yaml`.

**Recommendation:** Commit to `.aeos/agents/reviewer-agent.yaml`. Remove the `src/` alternative. Add `agents/` to the per-project layout in the system design as a future documentation update.

### ⚠️ MEDIUM (M1): Two-pass review structure not reflected in the YAML

System design §5.5 defines a two-pass review:
- **Pass 1 — Structure:** Evaluate artifact against structure rubric
- **Pass 2 — Drift:** Evaluate whether artifact still solves the original problem

The task's `taskInstruction` describes a single-pass evaluation ("Review the most recent artifact... against the rubrics provided"). The `outputFormat` has one `### Rubric Evaluation` table, not two passes.

The task's context section correctly notes "rubric paths are injected at runtime from the column spec." The two-pass structure is an orchestration concern (M2-011 assembles the prompt with rubric content). However, the reviewer's `systemPrompt` and `taskInstruction` should at least acknowledge that multiple rubrics may be present and should be evaluated separately.

**Assessment:** Not blocking for M2 (v1 uses single-pass). Medium risk for M3+ when multi-rubric column specs are active.

**Recommendation:** Add a sentence to `taskInstruction`: "If multiple rubrics are provided, evaluate each one as a separate section in your output."


### ⚠️ MEDIUM (M2): Missing `role` field in YAML — inconsistent with M2-007 review amendment

The M2-007 review (REVIEW-20260407-M2-007, finding M3) recommended adding `role: z.enum(['worker', 'reviewer']).optional()` to `AgentSpecSchema`. The amended M2-007 task includes this field. M2-013's YAML does not include `role: reviewer`.

Since the field is optional (`.optional()`), this is not a parse error. However, this is the canonical reviewer agent — it should set `role: reviewer` explicitly to serve as the reference for all future agent specs.

**Recommendation:** Add `role: reviewer` to the YAML.

### ⚠️ MEDIUM (M3): Template variables `{ticketId}` and `{column}` — no substitution mechanism defined

The task's `taskInstruction` uses `{ticketId}`:
```
Review the most recent artifact for ticket {ticketId} against the rubrics...
```

The `outputFormat` uses both `{ticketId}` and `{column}`:
```
## Review: {ticketId} — {column}
```

M2-005's `buildPrompt()` assembles sections from `agentSpec.systemPrompt`, `agentSpec.taskInstruction`, `agentSpec.outputFormat`. But M2-005 performs **no template variable substitution** — it concatenates the fields as-is. M2-011's orchestration doesn't mention interpolation either.

**Impact:** The literal strings `{ticketId}` and `{column}` will appear in the prompt. The LLM will likely infer the correct ticket ID from context (ticket.md is included), so this may work in practice. But it's fragile.

**Recommendation:** Either:
1. Remove template variables and use context-only prompting ("Review the most recent artifact against the rubrics provided in the context"), or
2. Define a template substitution step in M2-005 or M2-011.

Option 1 is simpler and more aligned with the current M2-005 design.

### ✅ `selfVerificationChecklist` — ALIGNED with M2-007

3 checklist items present. `AgentSpecSchema` defines `selfVerificationChecklist: z.array(z.string()).default([])`. AC requires "at least 3 items." ✓

### ✅ `executor.type: claude-cli` — ALIGNED with M2-007 and M2-003

Matches `AgentSpecSchema` enum and M2-003 executor adapter. All M2 tasks aligned on the `claude-cli` short form. ✓

### ✅ `executor.timeoutSeconds: 180` — REASONABLE

Shorter than the default 300s — appropriate for review (less complex than generation). ✓

### ✅ Hand-authoring method — CORRECT per action plan

Action plan §M2: "Write `reviewer-agent.yaml` by hand during M2... This is the one agent spec that cannot dogfood itself." ✓

---

## 2. Dependencies

### ✅ M2-007 (AgentSpecSchema) — CORRECT
AC #1 validates against `AgentSpecSchema.parse()`. ✓

### ✅ M2-008 (loadAgentSpec) — CORRECT
Validates the end-to-end loading chain: file → YAML parse → Zod validation. ✓

### ⚠️ INFO: No integration test with M2-005 or M2-011
The task only validates structural correctness, not prompt assembly. Appropriate for M2 — integration verified in M3.

---

## 3. File Path Alignment with Hexagonal Scaffold

| Concern | Status | Notes |
|---------|--------|-------|
| `.aeos/agents/reviewer-agent.yaml` | ❌ Not in scaffold | No `agents/` directory in system design §3.3 per-project layout |
| `src/domain/model/agent-spec.ts` | ✓ Exists | Placeholder for Zod schema (M2-007) |
| `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` | ✓ Exists | Placeholder loader (M2-008) |
| `src/domain/ports/driven/agent-spec-loader.port.ts` | ✓ Exists | Placeholder port |

The YAML is runtime configuration, not source code — it should live in `.aeos/agents/`, not `src/`. See GAP-2.

---

## 4. Consistency with Sibling Tasks

### vs M2-007 (AgentSpecSchema) — ✅ CONSISTENT (with M2 caveat)

YAML fields match schema: `name`, `systemPrompt`, `taskInstruction`, `outputFormat`, `selfVerificationChecklist`, `executor.type`, `executor.timeoutSeconds`. Missing `role` (optional — see M2) and `executor.model` (optional — global config handles it). ✓

### vs M2-008 (AgentSpecLoader) — ⚠️ PATH CONFIRMATION NEEDED

`YamlAgentSpecLoader.load('agents/reviewer-agent.yaml')` resolves relative to `aeosDir()`. Requires file at `.aeos/agents/reviewer-agent.yaml`. Task must commit to this path. See GAP-2.

### vs M2-011 (ticket-run) — ✅ CONSISTENT

M2-011 step 11 loads the reviewer agent spec and invokes `buildPrompt(reviewerContext, reviewerAgentSpec)`. Rubrics injected via context, not agent YAML — matching the task's design. ✓

### vs M3-001 (AEOS-1 PM Agent Spec) — ✅ CONSISTENT

M3-001 expects reviewer conclusion of APPROVED or APPROVED_WITH_WARNINGS. Matches task's output format. ✓

### vs System Design §5.6 (Review Cycle) — ⚠️ SEE GAP-1

Finding severity model mismatch. Review cycle routes by INFO/WARNING/BLOCKER; task uses PASS/WARN/FAIL.

---

## 5. Gaps That Would Block Implementation

### ⚠️ MAJOR (GAP-1): Finding model mismatch — does NOT block M2, BLOCKS M3+ review loop

M2-011 v1 stores but doesn't parse reviewer output. Safe for M2. When the review loop is implemented (max iterations + rework + escalation), finding severity must match routing logic. Fix now to avoid rewrite.

### ⚠️ MAJOR (GAP-2): File location ambiguity — BLOCKS M2-008 integration test

M2-008 AC: "Given `loadAgentSpec('agents/reviewer-agent.yaml')`, when calling it, then the agent YAML is parsed and validated." If file is at `src/agents/` instead of `.aeos/agents/`, this test fails.

### ✅ No other blocking gaps

YAML syntax valid. Fields match schema. Content reasonable. ACs testable.

---

## 6. Minor Issues and Recommendations

### m1: `executor.model` not specified

M2-007 review recommended `model: z.string().optional()` on executor config. The YAML omits it. Not blocking (global config handles model selection), but including `model: claude-sonnet-4-20250514` or similar would make the spec self-documenting. Consider adding for completeness.

### m2: Conclusion vocabulary not defined as an enum

The output format uses APPROVED / APPROVED_WITH_WARNINGS / REJECTED as free text. No Zod schema validates the reviewer's conclusion. This is fine for v1 (LLM output is unstructured text), but parsing the conclusion programmatically in M3+ will require string matching.

### m3: `selfVerificationChecklist` item 3 is a logical rule, not a verification step

"Conclusion matches the highest severity finding (any FAIL → REJECTED)" is a correctness rule, not a self-check. The LLM should apply this rule during generation. As a verification step, it should be phrased: "Verify that the conclusion matches — if any FAIL exists, conclusion must be REJECTED."

### m4: No mention of encoding or line ending requirements

The YAML file should be UTF-8 with LF line endings. Minor — standard practice, but worth noting for cross-platform consistency.

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| GAP-1 | **Major** | Finding model PASS/WARN/FAIL misaligns with system design's INFO/WARNING/BLOCKER — blocks M3+ review loop | Align to system design severity tags; adopt INFO/WARNING/BLOCKER output |
| GAP-2 | **Major** | File location ambiguous (`.aeos/agents/` vs `src/agents/`) — blocks M2-008 integration | Commit to `.aeos/agents/reviewer-agent.yaml`; remove `src/` alternative |
| M1 | Medium | Two-pass review structure not reflected in YAML — system design §5.5 defines Pass 1 (structure) + Pass 2 (drift) | Add multi-rubric awareness to taskInstruction |
| M2 | Medium | Missing `role: reviewer` — M2-007 amended schema includes optional `role` field | Add `role: reviewer` to YAML |
| M3 | Medium | Template variables `{ticketId}`, `{column}` have no substitution mechanism in M2-005 or M2-011 | Remove template variables; use context-only prompting |
| m1 | Minor | Missing `executor.model` field | Consider adding for self-documentation |
| m2 | Minor | Conclusion vocabulary is free text, not validated | Acceptable for v1; note for M3+ parsing |
| m3 | Minor | selfVerificationChecklist item 3 phrased as rule, not verification step | Rephrase as verification action |
| m4 | Minor | No encoding/line-ending spec | Standard practice; note for cross-platform |

---

## Recommended Task Amendments

### 1. Align finding model with system design

Replace the `taskInstruction` and `outputFormat` to use INFO/WARNING/BLOCKER:

```yaml
taskInstruction: |
  Review the most recent artifact against the rubrics provided in the context.
  For each rubric criterion, evaluate whether the artifact meets it.
  Output findings for any criterion that is NOT fully met:
  - INFO: observation, no action required
  - WARNING: should fix; non-blocking but tracked
  - BLOCKER: must fix; blocks advancement
  If all criteria are met with no findings, state APPROVED.
  If only INFO/WARNING findings exist, state APPROVED_WITH_WARNINGS.
  If any BLOCKER exists, state REJECTED and list all BLOCKERs.

outputFormat: |
  ## Review: {column}

  ### Findings

  #### BLOCKER
  - [BLOCKER] {description — cite artifact content}

  #### WARNING
  - [WARNING] {description}

  #### INFO
  - [INFO] {description}

  ### Conclusion
  **[APPROVED / APPROVED_WITH_WARNINGS / REJECTED]**
  [Summary — 1–3 sentences]
```

### 2. Remove template variables

Replace `{ticketId}` references with context-driven language:
- `taskInstruction`: "Review the most recent artifact against the rubrics provided in the context."
- `outputFormat`: "## Review: {column}" → keep `{column}` only if a substitution mechanism is added in M2-005; otherwise use "## Review" and let the LLM infer from context.

### 3. Add `role` field

```yaml
name: reviewer-agent
role: reviewer
systemPrompt: |
  ...
```

### 4. Commit to `.aeos/agents/` path

Remove the `src/` alternative. Update the task to:
> Create `.aeos/agents/reviewer-agent.yaml`

Add to system design §3.3 per-project layout (as a follow-up documentation task):
```
.aeos/
  agents/
    reviewer-agent.yaml
  column-specs/
    ...
```

### 5. Update `selfVerificationChecklist` item 3

```yaml
selfVerificationChecklist:
  - Every rubric criterion appears in the findings or is confirmed passing (no omissions)
  - BLOCKER items are listed explicitly before the conclusion
  - Verify that the conclusion matches the highest severity — if any BLOCKER exists, conclusion must be REJECTED
```

---

## Verdict

**Approve with required changes:**

1. **Align the finding severity model** with system design's INFO/WARNING/BLOCKER — the current PASS/WARN/FAIL model diverges from the system design (§5.5, §5.6), PRD (FR-05), and will require a rewrite when the review loop is implemented in M3+.
2. **Commit to `.aeos/agents/reviewer-agent.yaml`** — remove the `src/` alternative. M2-008's `loadAgentSpec()` resolves relative to `aeosDir()` and cannot find files outside `.aeos/`.
3. **Add `role: reviewer`** to the YAML for consistency with the amended `AgentSpecSchema`.
4. **Remove or resolve template variables** — M2-005's `buildPrompt()` does not perform substitution; literal `{ticketId}` will appear in the prompt.

The task is otherwise well-scoped. The YAML structure matches `AgentSpecSchema`. The bootstrapping rationale is sound. The acceptance criteria cover parsing, content, and executor type. The 180-second timeout is appropriate. Implementation is straightforward — it's a hand-authored file with a schema validation check — and the amendments above are all content changes to the YAML, not structural changes to the task.
