# PRD Structure Rubric

Evaluates the structural completeness and quality of a Product Requirements Document (PRD).
The reviewer applies each criterion independently. A PRD must **PASS** all criteria to be accepted.
Any **FAIL** blocks advancement; **WARN** requires the reviewer to flag the issue but does not block.

---

## 1. Problem Statement Clarity

Evaluates whether the PRD clearly articulates the problem being solved and why it matters.

| Grade | Definition |
|-------|------------|
| **PASS** | The problem statement is specific, identifies who is affected, describes the current pain or gap, and explains why solving it matters now. A reader unfamiliar with the project can understand the problem after reading this section alone. |
| **WARN** | A problem is stated but is vague, overly broad, or missing one of: affected audience, current pain, or motivation. The reader can infer the intent but must make assumptions. |
| **FAIL** | No problem statement exists, or the section describes a solution rather than a problem. The reader cannot determine what problem the PRD is trying to solve. |

---

## 2. User Persona Definition

Evaluates whether the PRD identifies and describes the target users or actors.

| Grade | Definition |
|-------|------------|
| **PASS** | At least one user persona or actor is explicitly named with a description of their role, goals, and relevant context. If multiple personas exist, each is distinguished and their relationship to the product is clear. |
| **WARN** | Users are mentioned but not described — e.g., "users will…" without specifying who the users are, what distinguishes them, or what their goals are. |
| **FAIL** | No user persona, actor, or target audience is identified anywhere in the PRD. The document does not answer "who is this for?" |

---

## 3. Success Metrics Measurability

Evaluates whether the PRD defines success in measurable, verifiable terms.

| Grade | Definition |
|-------|------------|
| **PASS** | The PRD lists at least one success metric that is specific, measurable, and time-bound or has a clear verification method. Examples: "reduce onboarding time by 30%", "100% of API responses return within 200ms", "all 5 acceptance tests pass". |
| **WARN** | Success metrics exist but are vague or not measurable — e.g., "improve user experience", "make the system faster". The intent is present but cannot be objectively verified. |
| **FAIL** | No success metrics, KPIs, or definition of "done" are provided. There is no way to determine whether the feature achieved its goal. |

---

## 4. Scope Definition (In/Out)

Evaluates whether the PRD explicitly defines what is in scope and what is out of scope.

| Grade | Definition |
|-------|------------|
| **PASS** | The PRD contains explicit in-scope and out-of-scope sections (or equivalent). In-scope items are specific enough to estimate. Out-of-scope items demonstrate that boundaries were deliberately chosen — they name things the reader might reasonably expect but that are excluded. |
| **WARN** | In-scope work is described but out-of-scope is missing or trivial (e.g., "everything else is out of scope"). Alternatively, scope is implicit in the requirements but never stated as a dedicated section. |
| **FAIL** | No scope boundaries are defined. The PRD does not distinguish between what will and will not be built. A developer reading it cannot tell where to stop. |

---

## 5. Acceptance Criteria Testability

Evaluates whether the PRD provides acceptance criteria that can be objectively tested.

| Grade | Definition |
|-------|------------|
| **PASS** | Acceptance criteria are present, written as verifiable statements (given/when/then, checklists, or equivalent), and cover the primary user flows. Each criterion has a clear binary outcome — it either passes or it does not. |
| **WARN** | Acceptance criteria exist but are subjective, incomplete, or cover only a subset of the described scope. Examples: "the UI should feel responsive", criteria that cover happy path but omit error cases mentioned in scope. |
| **FAIL** | No acceptance criteria are provided, or the criteria are indistinguishable from the requirements section (restated features rather than testable conditions). |

---

## Validation: Hypothetical Bad PRD

The following hypothetical PRD excerpt is evaluated against the rubric to confirm detection:

> **Title:** New Dashboard Feature
>
> We need to build a dashboard. It should show important data and be easy to use.
> Users will love it. Ship by Q3.

| Criterion | Grade | Rationale |
|-----------|-------|-----------|
| 1. Problem Statement Clarity | **FAIL** | No problem described — "we need to build a dashboard" is a solution statement, not a problem. |
| 2. User Persona Definition | **FAIL** | "Users" is mentioned but no persona is defined — who are they, what do they need? |
| 3. Success Metrics Measurability | **FAIL** | "Users will love it" is not measurable. No KPIs or verification method. |
| 4. Scope Definition (In/Out) | **FAIL** | No in-scope or out-of-scope items. "Show important data" is unbounded. |
| 5. Acceptance Criteria Testability | **FAIL** | No acceptance criteria of any kind. |

**Result:** All 5 criteria trigger FAIL, confirming the rubric catches structural deficiencies.
