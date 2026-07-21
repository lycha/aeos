# Tech Spec Structure Rubric

Evaluates the structural completeness and quality of a Technical Specification document.
The reviewer applies each criterion independently. A tech spec must **PASS** all criteria to advance to IMPLEMENTATION.
Any **FAIL** blocks advancement; **WARN** requires the reviewer to flag the issue but does not block.

---

## 1. Component Diagram or Module List

Evaluates whether the tech spec provides a clear decomposition of the system into components, modules, or services.

| Grade | Definition |
|-------|------------|
| **PASS** | The tech spec includes a component diagram, module list, or equivalent structural breakdown. Each component/module is named, its responsibility is described, and its relationships to other components are explicit. A developer can identify all moving parts and their boundaries. |
| **WARN** | Components or modules are mentioned in prose but not enumerated in a dedicated section. Relationships between components are implied but not stated. A developer can guess the structure but must infer boundaries. |
| **FAIL** | No component breakdown, module list, or architectural diagram is provided. The tech spec describes behaviour without identifying the structural units that implement it. |

---

## 2. API Contracts

Evaluates whether the tech spec defines the interfaces between components, including endpoints, request/response schemas, and protocols.

| Grade | Definition |
|-------|------------|
| **PASS** | All inter-component and external API contracts are specified. Each endpoint or interface includes: method/protocol, path or function signature, request schema (parameters, body), response schema (success and error shapes), and relevant status codes or error codes. Schemas use concrete types — no unresolved `any` or `object`. |
| **WARN** | API contracts are partially defined — e.g., endpoints are listed but schemas are missing, or only the happy-path response is described. Error responses or edge-case parameters are absent. |
| **FAIL** | No API contracts, endpoint definitions, or interface specifications are provided. The tech spec does not answer "how do components communicate?" |

---

## 3. Data Model Changes

Evaluates whether the tech spec describes changes to persistent data structures — database schemas, configuration files, or shared state.

| Grade | Definition |
|-------|------------|
| **PASS** | All new or modified data entities are described with field names, types, constraints (nullability, uniqueness, defaults), and relationships (foreign keys, references). Migration strategy is stated if existing data is affected. If no data model changes are required, the spec explicitly states "no data model changes". |
| **WARN** | Data model changes are mentioned but incompletely — e.g., new fields are named without types, or migration strategy is absent for a schema change that affects existing records. |
| **FAIL** | The tech spec introduces behaviour that implies data changes (new entities, new fields, new relationships) but does not describe the data model. Alternatively, the spec is silent on data model changes without an explicit "none required" statement. |

---

## 4. Error Handling Strategy

Evaluates whether the tech spec defines how errors are detected, propagated, and reported.

| Grade | Definition |
|-------|------------|
| **PASS** | The tech spec describes error categories (validation errors, infrastructure failures, domain errors), how each is handled (retry, propagate, fallback), and what the caller or user sees (error codes, messages, HTTP status codes). Failure modes for external dependencies are addressed. |
| **WARN** | Error handling is mentioned for the happy path (e.g., "returns 400 on invalid input") but edge cases, infrastructure failures, or cascading errors are not addressed. |
| **FAIL** | No error handling strategy is described. The tech spec does not address what happens when things go wrong. |

---

## 5. Dependency Declarations

Evaluates whether the tech spec explicitly lists new runtime and build-time dependencies introduced by the change.

| Grade | Definition |
|-------|------------|
| **PASS** | All new libraries, services, and infrastructure dependencies are listed with version constraints or version selection rationale. If no new dependencies are introduced, the spec explicitly states "no new dependencies". License and security considerations are noted for third-party libraries. |
| **WARN** | Dependencies are mentioned in passing (e.g., "we'll use Redis for caching") but without version constraints, selection rationale, or explicit acknowledgement that the dependency is new. |
| **FAIL** | The tech spec introduces new libraries, services, or infrastructure without listing them. The reader cannot determine what must be installed, provisioned, or approved before implementation begins. |

---

## 6. Test Strategy Outline

Evaluates whether the tech spec describes how the implementation will be verified through testing.

| Grade | Definition |
|-------|------------|
| **PASS** | The tech spec includes a test strategy that covers: which components have unit tests, what integration or end-to-end scenarios are tested, and what test fixtures or mocks are required. Coverage expectations or critical paths are identified. |
| **WARN** | Testing is mentioned generically (e.g., "unit tests will be written") without specifying what is tested, at which level, or what the critical test scenarios are. |
| **FAIL** | No test strategy, testing section, or verification plan is present. The tech spec does not address how correctness will be validated. |

---

## Validation: Hypothetical Vague Tech Spec

The following hypothetical tech spec excerpt is evaluated against the rubric to confirm detection:

> **Title:** User Notification System
>
> We'll build a notification system. It will send emails and push notifications when things happen.
> We'll use some kind of queue. The API will accept notification requests.
> Data will be stored somewhere. We'll add tests later.

| Criterion | Grade | Rationale |
|-----------|-------|-----------|
| 1. Component Diagram or Module List | **FAIL** | No components or modules are identified. "Some kind of queue" is not a structural breakdown. |
| 2. API Contracts | **FAIL** | "The API will accept notification requests" names no endpoints, schemas, methods, or response shapes. |
| 3. Data Model Changes | **FAIL** | "Data will be stored somewhere" implies persistence but defines no entities, fields, or types. |
| 4. Error Handling Strategy | **FAIL** | No error handling is mentioned. What happens when email delivery fails? Queue unavailable? |
| 5. Dependency Declarations | **WARN** | A queue is mentioned ("some kind of queue") but no specific technology, version, or rationale is given. The dependency is acknowledged but unspecified. |
| 6. Test Strategy Outline | **FAIL** | "We'll add tests later" explicitly defers testing with no strategy, scenarios, or coverage plan. |

**Result:** 5 criteria trigger FAIL and 1 triggers WARN, confirming the rubric catches structural deficiencies in vague tech specs.
