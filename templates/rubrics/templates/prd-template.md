# Product Requirements Document

## 1. Problem Statement

[Describe the problem being solved in 2–3 sentences. Identify who is affected, what the current pain or gap is, and why solving it matters now. Do not describe the solution — focus on the problem.]

## 2. User Personas

[List each distinct user persona or actor. For each, provide:]

- **Persona:** [Name or role, e.g., "Platform Engineer"]
  - **Description:** [Who they are and their relevant context]
  - **Goals:** [What they are trying to accomplish]
  - **Pain points:** [Current frustrations or unmet needs related to this problem]

[Repeat for each additional persona. Every persona must be specific — avoid generic "user".]

## 3. Success Metrics

[Define how success will be measured. Each metric must be specific, measurable, and have a clear verification method.]

| Metric | Target | Verification Method |
|--------|--------|---------------------|
| [e.g., Onboarding completion rate] | [e.g., ≥ 90% within 5 minutes] | [e.g., Automated timer in onboarding flow] |
| [e.g., API response latency] | [e.g., p95 < 200ms] | [e.g., Load test with k6] |

[Include at least one metric. Avoid vague terms like "improve experience" — every metric must be objectively verifiable.]

## 4. Background

[Describe the current state of the system relevant to this ticket. What exists today that this ticket changes or extends? If this is a greenfield feature, state that explicitly and skip this section.]

## 5. User Stories

[Write one user story per bullet. Each story must reference a specific persona from Section 2.]

- As a [persona from Section 2], I want [capability], so that [measurable benefit].
- As a [persona from Section 2], I want [capability], so that [measurable benefit].

## 6. Scope

### 6.1 In Scope

[List specific items that are included in this ticket. Each item should be concrete enough to estimate.]

- [Item 1: e.g., "REST endpoint for creating a new widget"]
- [Item 2: e.g., "Input validation for all required fields"]
- [Item 3: e.g., "Error response for duplicate widget names"]

### 6.2 Out of Scope

[List items the reader might reasonably expect but that are deliberately excluded. Explain why if not obvious.]

- [Item 1: e.g., "Bulk import of widgets — deferred to Phase 2"]
- [Item 2: e.g., "Admin UI for managing widgets — separate ticket PROJ-456"]

[This section must contain at least one item. "Everything else" is not acceptable.]

## 7. Functional Requirements

[Define each functional requirement as a testable statement with acceptance criteria.]

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-1 | [Describe what the system must do] | Given [precondition], When [action], Then [expected result] |
| FR-2 | [Describe what the system must do] | Given [precondition], When [action], Then [expected result] |

[Each requirement must have at least one acceptance criterion. Use Given/When/Then or equivalent testable format.]

## 8. Non-Functional Requirements

[Include only categories relevant to this ticket. Omit this section entirely if none apply.]

| ID | Category | Requirement | Verification |
|----|----------|-------------|--------------|
| NFR-1 | [e.g., Performance] | [e.g., API responds within 200ms at p95 under 100 concurrent users] | [e.g., Load test] |
| NFR-2 | [e.g., Security] | [e.g., All inputs sanitised against XSS] | [e.g., OWASP ZAP scan] |

## 9. Assumptions

[List assumptions made where the ticket was ambiguous. Number each assumption.]

1. [e.g., "The existing authentication middleware supports the required role-based access."]
2. [e.g., "The database schema for widgets does not exist yet — this is greenfield."]

[If no assumptions were needed, state: "No assumptions — the ticket was unambiguous."]

## 10. Open Questions

[List questions that could not be resolved from the ticket alone. These will be surfaced to the human operator via the preflight step.]

1. [e.g., "Should widget names be globally unique or unique per tenant?"]
2. [e.g., "What is the expected maximum number of widgets per account?"]

[If no open questions remain, state: "No open questions — all requirements are fully specified."]

## 11. Acceptance Criteria Summary

[Consolidate all acceptance criteria from the Functional Requirements table into a single numbered list. Each criterion must be independently testable with a binary pass/fail outcome.]

1. [e.g., Given a valid widget payload, When POST /widgets is called, Then a 201 response is returned with the created widget.]
2. [e.g., Given a duplicate widget name, When POST /widgets is called, Then a 409 response is returned.]
3. [e.g., Given an unauthenticated request, When any /widgets endpoint is called, Then a 401 response is returned.]

[Do not use subjective terms like "fast", "easy", or "intuitive" without measurable thresholds.]
