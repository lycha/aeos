# Review: M6-002 — AEOS-16 QA Agent Spec

**File reviewed:** `.aeos/agents/qa-agent.yaml`
**Task spec:** `docs/tasks/M6-002-AEOS-16-qa-agent-spec.md`
**Reviewed:** 2026-04-08

---

## Acceptance Criteria

### AC-1: `qa-agent.yaml` exists at `.aeos/agents/qa-agent.yaml`

**PASS** — File exists at the specified path.

### AC-2: Parsed with `AgentSpecSchema` — no ZodError

**PASS** — Validated by loading the YAML and running `AgentSpecSchema.parse()` via `npx tsx`. All fields pass validation: `name` (string, "qa-agent"), `role` (enum, "worker"), `systemPrompt` (string, 2767 chars), `taskInstruction` (string, 2269 chars), `outputFormat` (string, 3772 chars), `selfVerificationChecklist` (array of 5 strings), and `executor` (object with `type: "claude-cli"`, `model: "claude-sonnet-4-20250514"`, `timeoutSeconds: 300`).

### AC-3: `role` is set to `worker`

**PASS** — `role: worker` is set on line 2.

### AC-4: `systemPrompt` describes holistic quality assessment reasoning

**PASS** — The `systemPrompt` (lines 3–23) describes the agent as a "senior QA engineer" performing "comprehensive, holistic quality assessment." It covers six core principles: requirement coverage reasoning, edge case identification, risk assessment, production readiness evaluation, cross-artifact referencing, and evidence-based specificity. It documents the context scope (ticket, PRD, spike, tech spec, implementation notes, code review, CONSTRAINTS.md, codebase index) as informational per the task spec's note that `AgentSpecSchema` has no `contextScope` field and `ContextAssembler` handles actual injection. It states the agent serves a single column (QA) and does not fix defects.

### AC-5: `taskInstruction` covers cross-artifact analysis and QA report production

**PASS** — The `taskInstruction` (lines 25–58) defines a 6-step process: (1) requirements traceability across the full artifact chain, (2) cross-artifact consistency checking for contradictions and drift, (3) edge case and risk identification, (4) test coverage assessment, (5) constraint compliance verification, and (6) QA report production with risk-rated findings (CRITICAL/HIGH/MEDIUM/LOW) and READY/NOT READY recommendation. This fully satisfies the requirement for cross-artifact analysis and QA report production.

### AC-6: `outputFormat` contains inline placeholder template content

**PASS** — The `outputFormat` (lines 60–140) is a multi-line YAML string containing an inline placeholder template with all five required sections: Executive Summary (with `{ticket title}` placeholder and `[READY / NOT READY]` placeholder), Requirements Coverage (with tabular format and coverage rate placeholder), Edge Cases & Risks (with tabular format), Findings (with CRITICAL/HIGH/MEDIUM/LOW severity groupings and `{artifact}:{section}` placeholders), and Recommendation (with verdict, justification, and conditions). `PromptBuilder` treats this as inline text, not a file path, consistent with the task spec's technical notes.

### AC-7: `selfVerificationChecklist` contains ≥ 3 items

**PASS** — The checklist contains 5 items (lines 143–147):
1. PRD requirement coverage completeness
2. Evidence-based findings with artifact/section citations
3. Recommendation consistency with findings (CRITICAL/HIGH mandate NOT READY)
4. Cross-artifact consistency verification
5. Edge case test coverage assessment

All 5 items address cross-artifact consistency and recommendation justification as required by the task spec.

---

## Definition of Done

### DoD-1: `qa-agent.yaml` committed and schema-valid

**PASS** — File exists and passes `AgentSpecSchema.parse()` without errors. Commit status is outside the scope of this code review (file is on disk and schema-valid).

### DoD-2: AEOS-16 ticket reaches DONE

**N/A** — Pipeline transit status is outside the scope of this artifact review.

### DoD-3: Reviewer agent signs off on the produced artifact

**N/A** — This review serves as the sign-off assessment. No blocking issues found.

---

## Additional Validation

### Task spec item 9: `executor.type: claude-cli`, `executor.model: claude-sonnet-4-20250514`

**PASS** — `executor.type` is `claude-cli`, `executor.model` is `claude-sonnet-4-20250514`, and `executor.timeoutSeconds` defaults to `300`. All match the task specification.

### Task spec item 5: Context scope documented in `systemPrompt`

**PASS** — The `systemPrompt` includes a dedicated "Context scope" section (lines 15–19) documenting ticket description, all prior artifacts (PRD, spike, tech spec, implementation notes, code review), CONSTRAINTS.md, and codebase index. It is explicitly marked as "informational — ContextAssembler handles actual injection."

### Task spec item 7: `outputFormat` is inline text, not a file path

**PASS** — The `outputFormat` field contains the full template content as a multi-line YAML string (3772 characters). It is not a file path reference. The task spec notes that M6-003 (AEOS-17) will update this field with the full template content later.

---

## Summary

| Criterion | Result |
|-----------|--------|
| AC-1: File exists | PASS |
| AC-2: Schema-valid | PASS |
| AC-3: Role is worker | PASS |
| AC-4: systemPrompt describes holistic QA | PASS |
| AC-5: taskInstruction covers cross-artifact analysis | PASS |
| AC-6: outputFormat has inline template | PASS |
| AC-7: selfVerificationChecklist ≥ 3 items | PASS |

**Overall: ALL PASS — no fixes required.**
