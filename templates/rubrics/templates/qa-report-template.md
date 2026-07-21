# QA Report: {ticket title}

## 1. Executive Summary

[2–3 paragraph summary of the overall quality assessment. State the total number of artifacts reviewed, the overall finding distribution (CRITICAL/HIGH/MEDIUM/LOW counts), and the recommendation. Highlight the most significant findings that influenced the recommendation.]

[If the recommendation is NOT READY, state the minimum changes required to achieve READY status. If READY, confirm that all quality gates are satisfied.]

**Recommendation:** **[READY FOR DOD / NOT READY]**

---

## 2. Requirements Coverage Matrix

[Trace every PRD requirement through the full artifact chain. Each row must show whether the requirement is covered at each pipeline stage. Do not omit any requirement — silent omissions are defects.]

| PRD Requirement | Spike | Tech Spec | Implementation | Code Review | Status |
|-----------------|-------|-----------|----------------|-------------|--------|
| [e.g., FR-1: Widget creation endpoint] | [✅ / ⚠️ / ❌ / N/A] | [✅ / ⚠️ / ❌ / N/A] | [✅ / ⚠️ / ❌ / N/A] | [✅ / ⚠️ / ❌ / N/A] | [Covered / Partial / Missing] |

[Legend: ✅ = fully covered, ⚠️ = partially covered, ❌ = missing, N/A = not applicable at that stage.]

**Coverage rate:** [X of Y requirements fully covered] ([percentage]%)

---

## 3. Edge Cases & Risk Assessment

[Identify edge cases, boundary conditions, and risks that could cause production issues. Each entry must be specific — name the exact scenario, cite the source artifact, and assign a severity rating.]

| # | Category | Description | Source Artifact | Severity | Mitigation Status |
|---|----------|-------------|-----------------|----------|-------------------|
| 1 | [e.g., Boundary] | [e.g., "No validation for widget name exceeding 255 characters"] | [e.g., "PRD §FR-1, Tech Spec §3.1"] | [CRITICAL / HIGH / MEDIUM / LOW] | [Addressed / Unaddressed / Partially addressed] |

[Include at minimum: edge cases derived from PRD acceptance criteria, error conditions from the tech spec, integration risks from the architecture spike, and any open questions or assumptions that were never validated.]

**Severity breakdown:** [X CRITICAL, Y HIGH, Z MEDIUM, W LOW]

---

## 4. Test Results Summary

[Assess test coverage across the artifact chain. Evaluate whether the implementation has adequate unit, integration, and edge-case test coverage.]

| Test Category | Expected (from PRD/Spec) | Implemented | Coverage | Gaps |
|---------------|--------------------------|-------------|----------|------|
| [e.g., Unit tests] | [e.g., "All FR acceptance criteria"] | [e.g., "FR-1 through FR-4 covered"] | [e.g., "4/5 = 80%"] | [e.g., "FR-5 error path untested"] |
| [e.g., Integration tests] | [e.g., "Cross-boundary interactions per Tech Spec §5"] | [e.g., "API→DB tested"] | [e.g., "2/3 = 67%"] | [e.g., "Queue failure recovery untested"] |
| [e.g., Edge case tests] | [e.g., "Boundary conditions from PRD §AC"] | [e.g., "Empty input tested"] | [e.g., "1/4 = 25%"] | [e.g., "Max length, concurrent access, null fields untested"] |

[Every acceptance criterion from the PRD should map to at least one test. Untested acceptance criteria are findings.]

**Overall test coverage assessment:** [Adequate / Insufficient — with justification]

---

## 5. Findings

[Detailed findings grouped by severity. Each finding must cite the specific artifact and section as evidence. Vague or unsupported findings are not acceptable.]

### CRITICAL

[Issues that will cause production failures, data loss, or security vulnerabilities. Must be resolved before deployment.]

- **[C-1]** {artifact}:{section} — {description of the issue, evidence from artifacts, and production impact}

[If no critical findings: "No critical findings."]

### HIGH

[Issues with significant impact that should be resolved before deployment but may not cause immediate failure.]

- **[H-1]** {artifact}:{section} — {description of the issue, evidence from artifacts, and potential impact}

[If no high findings: "No high findings."]

### MEDIUM

[Issues with moderate impact — functionality works but with suboptimal behaviour, missing polish, or incomplete coverage.]

- **[M-1]** {artifact}:{section} — {description of the issue, evidence from artifacts, and impact}

[If no medium findings: "No medium findings."]

### LOW

[Minor observations, style inconsistencies, documentation gaps, or improvement suggestions that do not affect correctness.]

- **[L-1]** {artifact}:{section} — {description of the issue, evidence from artifacts, and suggestion}

[If no low findings: "No low findings."]

**Finding totals:** [X CRITICAL, Y HIGH, Z MEDIUM, W LOW]

---

## 6. Recommendation

**Verdict:** **[READY FOR DOD / NOT READY]**

[The verdict must be one of exactly two values: READY FOR DOD or NOT READY. No other values are acceptable.]

**Justification:**

[Explain the recommendation based on the findings. Reference specific finding IDs (C-1, H-1, etc.) that drive the decision. If NOT READY, list the specific items that must be resolved. If READY, confirm that all requirements are covered, no critical issues exist, and the implementation is safe for production.]

[IMPORTANT: If ANY CRITICAL findings exist or ANY unresolved HIGH findings exist, the verdict MUST be NOT READY. A READY verdict with outstanding CRITICAL or HIGH findings is an inconsistency that will be flagged by the reviewer.]

**Conditions for READY (if NOT READY):**

[Numbered list of specific actions required to achieve READY status. Each action must reference a finding ID.]

1. [e.g., "Resolve C-1: Add input validation for widget name length (PRD §FR-1)"]
2. [e.g., "Resolve H-1: Add integration test for queue failure recovery (Tech Spec §5.2)"]

[If READY FOR DOD, state: "No conditions — all quality gates are satisfied."]
