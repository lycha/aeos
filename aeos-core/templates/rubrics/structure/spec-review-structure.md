# Spec Review Structure Rubric

Applied by the reviewer in **SPEC_REVIEW** to grade the spec review: the list of
findings an agent wrote about a specification a person wrote. It checks the
review, not the spec. The pinned spec, decisions and scenarios are in context.

The reviewer applies each criterion independently. Any **FAIL** blocks
advancement; **WARN** must be flagged but does not block.

---

## 1. Every Finding Cites an Id

| Grade | Definition |
|-------|------------|
| **PASS** | Every finding cites at least one id (`AC-n`, `INV-n`, `NON-GOAL-n`, or a decision, conflict or question id), and every cited id exists in the pinned spec or decisions.yaml. |
| **WARN** | One finding cites an id loosely (a section rather than a statement) but the statement it concerns is still identifiable. |
| **FAIL** | A finding cites no id, or cites an id that does not exist. The person cannot tell which statement to fix. |

---

## 2. No Finding Proposes a Requirement

| Grade | Definition |
|-------|------------|
| **PASS** | Findings describe problems only. None proposes a requirement, an acceptance criterion, a decision or replacement wording, and the spec is not rewritten anywhere in the review. |
| **WARN** | A finding hints at a direction ("consider the empty case") without stating what the spec should require. |
| **FAIL** | A finding states what the spec should say, drafts a criterion, or the review contains a rewritten spec. Specification is the person's work; the agent reviews it. |

---

## 3. Severities Are Justified

| Grade | Definition |
|-------|------------|
| **PASS** | Every finding has a severity (BLOCKER, WARNING or INFO) and a stated consequence that matches it: a BLOCKER names what would be built wrong or could not be verified. |
| **WARN** | Severities are present but one justification is thin, or a preference is rated above INFO. |
| **FAIL** | Findings carry no severity, or severities are asserted with no consequence, so the person cannot tell what must be settled before approving the spec. |

---

## 4. The Four Sections Are Present

| Grade | Definition |
|-------|------------|
| **PASS** | The review has the sections **Gaps**, **Ambiguities**, **Contradictions** and **Untestable criteria**, each with findings or an explicit statement that none were found. |
| **WARN** | All four are present but a finding sits in the wrong section. |
| **FAIL** | A section is missing, so it is unknown whether that kind of defect was looked for. |
