# QA Report Structure Rubric

Evaluates the structural completeness and quality of a QA Report artifact.
The reviewer applies each criterion independently. A QA report must **PASS** all criteria to be accepted.
Any **FAIL** blocks advancement; **WARN** requires the reviewer to flag the issue but does not block.

---

## 1. Implementation Notes Coverage

Evaluates whether every section and requirement from the implementation notes is addressed in the QA report's requirements coverage matrix and findings.

| Grade | Definition |
|-------|------------|
| **PASS** | Every section of the implementation notes (file changes, test plan, rollback plan, sequencing) has a corresponding assessment in the QA report. The requirements coverage matrix traces each implementation item back to the PRD and forward to the code review. No implementation notes section is left unexamined. |
| **WARN** | Most implementation notes sections are assessed, but one or more non-critical sections (e.g., rollback plan, sequencing) lack explicit evaluation. The omitted sections are inferable as low-risk but are not mentioned. |
| **FAIL** | Multiple implementation notes sections have no corresponding assessment in the QA report. The reader cannot confirm that the QA agent reviewed the full scope of the implementation. Key sections (file changes, test plan) are missing from the coverage matrix. |

---

## 2. Edge Case Specificity

Evaluates whether edge cases identified in the QA report are specific, named scenarios rather than generic or hand-waving descriptions.

| Grade | Definition |
|-------|------------|
| **PASS** | Every edge case in the Edge Cases & Risk Assessment table names a concrete scenario with specific inputs, conditions, or states — e.g., "empty string for widget name", "concurrent updates to the same ticket by two agents", "YAML file with missing required field `column`". Each edge case cites the source artifact and section where the scenario originates or should have been addressed. |
| **WARN** | Edge cases are listed but some are generic or vague — e.g., "edge cases around input validation", "potential concurrency issues", "error handling might need improvement". The reviewer can see that edge cases were considered but cannot verify whether specific scenarios were actually assessed. |
| **FAIL** | No edge cases are identified, or all listed edge cases are generic placeholders — e.g., "various edge cases were considered", "standard error scenarios apply". The QA report provides no evidence that specific failure scenarios were analysed. |

---

## 3. Risk Rating Justification

Evaluates whether each risk-rated finding (CRITICAL, HIGH, MEDIUM, LOW) in the QA report is justified with evidence from the artifact chain, not merely asserted.

| Grade | Definition |
|-------|------------|
| **PASS** | Every finding includes: (a) a severity rating (CRITICAL/HIGH/MEDIUM/LOW), (b) a citation to a specific artifact and section as evidence, and (c) an explanation of why that severity level was assigned — e.g., "CRITICAL because this missing validation would allow invalid data to reach production (PRD §AC-3, Tech Spec §4.2 specifies input constraints)". The severity distribution is plausible given the evidence. |
| **WARN** | Findings have severity ratings and some evidence, but justification for the severity level is missing or superficial — e.g., a finding is marked CRITICAL without explaining the production impact, or evidence is cited without linking it to the severity assessment. |
| **FAIL** | Findings lack severity ratings entirely, or ratings are assigned without any evidence or justification. The reviewer cannot determine why a finding is CRITICAL versus LOW. Alternatively, all findings are marked the same severity regardless of actual impact. |

---

## 4. Recommendation Consistency

Evaluates whether the final recommendation (READY FOR DOD / NOT READY) is logically consistent with the findings and severity distribution reported in the QA report.

| Grade | Definition |
|-------|------------|
| **PASS** | The recommendation is consistent with the findings: (a) if any CRITICAL findings exist, the recommendation is NOT READY, (b) if any unresolved HIGH findings exist, the recommendation is NOT READY, (c) if the recommendation is READY FOR DOD, no CRITICAL or unresolved HIGH findings appear anywhere in the report, and (d) the justification section references specific finding IDs that support the verdict. |
| **WARN** | The recommendation is broadly consistent with findings, but the justification is weak — e.g., the verdict is NOT READY and CRITICAL findings exist, but the justification does not reference specific finding IDs, or the conditions-for-READY list is vague. |
| **FAIL** | The recommendation contradicts the findings. Examples: (a) READY FOR DOD with one or more CRITICAL findings, (b) READY FOR DOD with unresolved HIGH findings, (c) NOT READY with no findings above LOW severity and no explanation for the conservative verdict, or (d) the recommendation section is missing entirely. |

---

## 5. No Unfilled Template Placeholders

Evaluates whether the QA report contains any unfilled template placeholders, boilerplate instructions, or skeleton content that was not replaced with actual analysis.

| Grade | Definition |
|-------|------------|
| **PASS** | The QA report contains no template placeholders (e.g., `[e.g., ...]`, `{ticket title}`, `[description of the issue]`), no boilerplate instructions (e.g., "Fill in this section with..."), and no empty tables or sections. Every section contains substantive, ticket-specific content. |
| **WARN** | The QA report is mostly filled in, but one or two minor placeholders remain — e.g., a legend row in a table that was not removed, or a section heading exists with minimal content that reads as if the author ran out of time. |
| **FAIL** | Multiple template placeholders, boilerplate instructions, or empty sections remain in the QA report. The document reads as a partially filled template rather than a completed analysis. Examples: `{artifact}:{section}` markers in findings, `[2–3 paragraph summary]` instructions left in the executive summary, empty severity sections with only `[If no critical findings: ...]` prompts. |

---

## 6. Requirements Coverage Completeness

Evaluates whether the requirements coverage matrix accounts for every PRD requirement and acceptance criterion without silent omissions.

| Grade | Definition |
|-------|------------|
| **PASS** | The requirements coverage matrix lists every functional requirement and acceptance criterion from the PRD. Each row traces the requirement through all pipeline stages (Spike → Tech Spec → Implementation → Code Review) with a clear status (Covered / Partial / Missing). A coverage rate percentage is provided and is arithmetically correct. No PRD requirement is silently omitted. |
| **WARN** | The coverage matrix exists and covers most requirements, but one or more PRD requirements or acceptance criteria are missing from the table without explanation. The coverage rate may be stated but cannot be verified against the PRD because of the omissions. |
| **FAIL** | No requirements coverage matrix is present, or the matrix is a stub (e.g., a single example row). Alternatively, the matrix lists requirements but does not trace them through the artifact chain — it merely restates the PRD without assessing coverage at each stage. |


---

## Validation 1: Hypothetical Contradictory Report (READY + Critical Gaps)

The following hypothetical QA report excerpt is evaluated against the rubric to confirm that recommendation consistency is caught:

> **QA Report: Add Widget Endpoint**
>
> ## Executive Summary
> Reviewed 5 artifacts. Found 2 CRITICAL findings and 1 HIGH finding.
>
> **Recommendation:** **READY FOR DOD**
>
> ## Findings
> ### CRITICAL
> - **[C-1]** Tech Spec §3.1 — No input validation for widget name length. The API accepts arbitrarily long strings, risking database overflow and denial of service.
> - **[C-2]** Implementation Notes §4 — Rollback plan is missing. No strategy documented for reverting the migration if it corrupts existing widget records.
>
> ### HIGH
> - **[H-1]** Code Review §2 — Integration test for queue failure recovery is absent. The tech spec §5.2 requires graceful degradation on queue unavailability, but no test verifies this behaviour.
>
> ## Recommendation
> **Verdict:** **READY FOR DOD**
> **Justification:** The implementation covers most requirements and the code looks clean.

| Criterion | Grade | Rationale |
|-----------|-------|-----------|
| 1. Implementation Notes Coverage | **WARN** | The report references implementation notes §4 (rollback plan) but does not show systematic assessment of all sections — file changes, test plan, and sequencing are not evaluated. |
| 2. Edge Case Specificity | **PASS** | Findings C-1 and C-2 name specific scenarios: "arbitrarily long strings" for widget name, "corrupts existing widget records" for migration rollback. |
| 3. Risk Rating Justification | **PASS** | C-1 explains "risking database overflow and denial of service" with citation to Tech Spec §3.1. C-2 cites Implementation Notes §4. Severity assignments are justified. |
| 4. Recommendation Consistency | **FAIL** | The report recommends READY FOR DOD despite 2 CRITICAL findings (C-1, C-2) and 1 unresolved HIGH finding (H-1). This directly contradicts the rubric rule: any CRITICAL finding mandates NOT READY. The justification ("code looks clean") does not address the critical findings. |
| 5. No Unfilled Template Placeholders | **PASS** | No template placeholders or boilerplate instructions remain. All sections contain ticket-specific content. |
| 6. Requirements Coverage Completeness | **FAIL** | No requirements coverage matrix is present. The report jumps from executive summary to findings without tracing PRD requirements through the artifact chain. |

**Result:** Criterion 4 (Recommendation Consistency) triggers **FAIL** as required — confirming the rubric catches the contradiction between READY FOR DOD and outstanding CRITICAL findings. Criterion 6 also triggers FAIL due to missing coverage matrix.

---

## Validation 2: Hypothetical Bad QA Report (Missing Edge Cases, Generic Risks)

The following hypothetical QA report excerpt is evaluated to confirm detection of non-recommendation structural deficiencies:

> **QA Report: User Preferences Feature**
>
> ## Executive Summary
> All artifacts were reviewed. The implementation looks good overall. Some minor issues noted.
>
> **Recommendation:** **NOT READY**
>
> ## Requirements Coverage Matrix
> | PRD Requirement | Status |
> |-----------------|--------|
> | User preferences CRUD | Covered |
> | Preference export | Covered |
>
> Coverage rate: 100%
>
> ## Edge Cases & Risk Assessment
> - Various edge cases around input validation were considered
> - Potential concurrency issues may exist
> - Standard error scenarios apply
>
> ## Findings
> ### CRITICAL
> - **[C-1]** There might be issues with the database schema — needs checking
>
> ### HIGH
> No high findings.
>
> ## Recommendation
> **Verdict:** **NOT READY**
> **Justification:** Critical finding needs resolution.

| Criterion | Grade | Rationale |
|-----------|-------|-----------|
| 1. Implementation Notes Coverage | **FAIL** | No assessment of implementation notes sections. The report does not reference file changes, test plan, rollback plan, or sequencing from the implementation notes. |
| 2. Edge Case Specificity | **FAIL** | All three edge cases are generic: "various edge cases around input validation", "potential concurrency issues", "standard error scenarios". None names a specific scenario, input, or condition. No source artifact citations. |
| 3. Risk Rating Justification | **FAIL** | Finding C-1 is marked CRITICAL but has no evidence: "might be issues" is speculative, "needs checking" is an action item not a finding, and no artifact or section is cited. The severity cannot be verified. |
| 4. Recommendation Consistency | **PASS** | The recommendation is NOT READY and a CRITICAL finding exists — this is consistent. |
| 5. No Unfilled Template Placeholders | **PASS** | No template placeholders remain. Content is present in all sections. |
| 6. Requirements Coverage Completeness | **WARN** | A coverage matrix exists but does not trace requirements through the full artifact chain (Spike → Tech Spec → Implementation → Code Review). Only a single "Status" column is provided. The 100% coverage rate cannot be verified because PRD requirements may have been silently omitted. |

**Result:** Criteria 1, 2, and 3 trigger **FAIL**, confirming the rubric catches structural deficiencies beyond recommendation consistency. The generic edge cases and unjustified risk ratings are correctly identified as failures.