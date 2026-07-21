# Intent Drift Rubric

Cross-cutting pass-2 rubric applied by the reviewer in **all** pipeline columns after column-specific rubrics.
It detects when an artifact answers the wrong question or drifts from the original ticket intent.
The reviewer applies each criterion independently. An artifact must **PASS** all criteria to be accepted.
Any **FAIL** blocks advancement; **WARN** requires the reviewer to flag the issue but does not block.

---

## 1. Scope Creep

Evaluates whether the artifact stays within the boundaries defined by the originating ticket.

| Grade | Definition |
|-------|------------|
| **PASS** | The artifact addresses only the work items described in the ticket. Any extensions or enhancements are explicitly marked as out-of-scope or future work, not actively designed or implemented. |
| **WARN** | The artifact includes minor additions beyond the ticket scope that are reasonable and do not inflate effort, but they are not called out as out-of-scope. The core deliverable is still present and correct. |
| **FAIL** | The artifact expands the scope significantly beyond the ticket — e.g., designing a full theming engine when the ticket asks for a dark mode toggle, or adding unrequested integrations. The additional scope would materially increase effort, risk, or review surface. |

---

## 2. Problem–Solution Alignment

Evaluates whether the artifact solves the specific problem stated in the ticket rather than a different or adjacent problem.

| Grade | Definition |
|-------|------------|
| **PASS** | The problem the artifact addresses is clearly traceable to the ticket's stated problem or goal. A reader can draw a direct line from the ticket description to the artifact's content without inference gaps. |
| **WARN** | The artifact addresses the general area of the ticket but reframes the problem in a way that shifts emphasis — e.g., focusing on performance when the ticket asks for correctness. The original intent is partially served. |
| **FAIL** | The artifact solves a different problem than the one described in the ticket. The stated deliverable and the actual content answer fundamentally different questions. A reader comparing the ticket to the artifact would conclude they are about different topics. |

---

## 3. Stated Deliverable Coverage

Evaluates whether the artifact includes all deliverables explicitly required by the ticket.

| Grade | Definition |
|-------|------------|
| **PASS** | Every deliverable, output, or acceptance criterion listed in the ticket is addressed in the artifact. Nothing the ticket explicitly asks for is missing. |
| **WARN** | Most deliverables are covered, but one or more minor items are missing or only partially addressed. The omissions do not undermine the artifact's usefulness but would be caught in a checklist review. |
| **FAIL** | One or more primary deliverables from the ticket are absent from the artifact. The artifact cannot be considered complete against the ticket's own acceptance criteria or stated requirements. |

---

## 4. Audience & Context Fidelity

Evaluates whether the artifact is written for the correct audience and respects the context established by the ticket and its position in the pipeline.

| Grade | Definition |
|-------|------------|
| **PASS** | The artifact's depth, terminology, and assumptions match the expected audience for this pipeline column. It builds on prior-column outputs where applicable and does not duplicate or contradict them. |
| **WARN** | The artifact is generally appropriate but makes assumptions about context not established in the ticket or prior artifacts — e.g., referencing decisions that were never made, or writing implementation details in a scoping artifact. |
| **FAIL** | The artifact is written for the wrong audience or pipeline stage — e.g., a PRD that reads like a tech spec, or a code review that re-architects the solution. The content may be valid in isolation but is misplaced relative to the ticket's column. |

---

## Validation: Hypothetical Drifted Artifact

**Ticket:** "Add dark mode toggle — allow users to switch between light and dark themes via a toggle in the settings page."

**Drifted PRD excerpt:**

> **Title:** Comprehensive Theming Engine
>
> This PRD defines a full theming engine supporting unlimited custom themes,
> a theme marketplace where users can publish and download community themes,
> a CSS variable pipeline for runtime token injection, and a theme migration
> tool for converting legacy stylesheets. The settings page will be redesigned
> to include a theme gallery with preview thumbnails.

| Criterion | Grade | Rationale |
|-----------|-------|-----------|
| 1. Scope Creep | **FAIL** | The ticket asks for a light/dark toggle. The artifact designs a full theming engine with a marketplace, custom themes, and a migration tool — far exceeding the requested scope. |
| 2. Problem–Solution Alignment | **WARN** | The artifact is in the general domain (theming) but reframes the problem from "add a toggle" to "build an extensible theming platform." The original problem is buried. |
| 3. Stated Deliverable Coverage | **FAIL** | The ticket's deliverable is a toggle in the settings page. The artifact never specifies a simple toggle — it replaces it with a theme gallery, omitting the explicit ask. |
| 4. Audience & Context Fidelity | **WARN** | The PRD is reasonable in format but assumes a level of infrastructure investment not established by the ticket, introducing decisions and context that were never scoped. |

**Result:** Criteria 1 and 3 trigger FAIL, confirming the rubric catches intent drift.
