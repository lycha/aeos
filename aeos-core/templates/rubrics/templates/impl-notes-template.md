# Implementation Notes: {ticket title}

## 1. Summary

[1–2 paragraph summary of what will be implemented in this pass. Reference the tech spec sections that drive each change. State what is included in scope and what is explicitly deferred to future work. Identify the ticket and PRD requirements this implementation addresses.]

## 2. Approach & Design Decisions

[Describe the overall implementation approach and the key design decisions made. For each decision, state the alternatives considered, the tradeoffs evaluated (complexity, maintainability, testability, delivery speed), and the rationale for the chosen approach. Reference architecture spike decisions or tech spec guidance where applicable.]

| # | Decision | Alternatives Considered | Rationale |
|---|----------|------------------------|-----------|
| 1 | [e.g., "Use adapter pattern for queue integration"] | [e.g., "Direct Redis calls vs. adapter vs. library wrapper"] | [e.g., "Adapter isolates queue technology choice; aligns with hexagonal architecture in tech spec §2.1"] |

[If no significant design decisions were required, state: "Implementation follows the tech spec directly — no design decisions beyond those already documented in the spec."]

## 3. Requirements Traceability

[Map every tech spec requirement to the implementation artefact(s) that satisfy it. This section ensures no requirement is missed and no code change exists without a traced requirement. Every row must link a spec requirement to at least one file change and one test.]

| Tech Spec Requirement | Section | File(s) Changed | Test(s) | Status |
|-----------------------|---------|-----------------|---------|--------|
| [e.g., "NotificationEntity with required fields"] | [e.g., "§2.1"] | [e.g., `src/domain/notification.entity.ts`] | [e.g., "Unit: NotificationEntity validates fields"] | [Planned / Done] |
| [e.g., "Queue adapter conforms to QueuePort"] | [e.g., "§3.2"] | [e.g., `src/infrastructure/queue/redis-queue.adapter.ts`] | [e.g., "Integration: queue round-trip"] | [Planned / Done] |

[Every tech spec requirement must appear in this table. If a requirement is intentionally deferred, list it with Status = "Deferred" and a justification in the Notes column.]

## 4. Files Changed

[Ordered list of every file to be created or modified, grouped by logical concern. Each entry must include the rationale explaining why this file is changed and which requirement drives the change. No file change should exist without a traced requirement — orphan changes must be flagged.]

| # | File Path | Action | Rationale | Traced To |
|---|-----------|--------|-----------|-----------|
| 1 | [e.g., `src/domain/notification.entity.ts`] | [Create] | [e.g., "Define Notification entity interface and factory function per tech spec §2.1"] | [e.g., "Req §2.1"] |
| 2 | [e.g., `src/infrastructure/queue/redis-queue.adapter.ts`] | [Create] | [e.g., "Implement Redis queue adapter conforming to QueuePort interface per tech spec §3.2"] | [e.g., "Req §3.2"] |
| 3 | [e.g., `tests/unit/notification.entity.test.ts`] | [Create] | [e.g., "Unit tests for entity validation logic"] | [e.g., "Req §2.1, Test Plan §5.1"] |

[If a file change cannot be traced to a tech spec requirement, flag it explicitly: "⚠️ Orphan change — not traced to a spec requirement. Justification: {reason}."]

## 5. Test Plan

[List all tests to be written, grouped by type. Each test must reference the requirement and file change it validates. The test plan must cover happy-path scenarios, error cases, and edge cases derived from the PRD acceptance criteria.]

### 5.1 Unit Tests

| # | Test Description | File(s) Under Test | Key Assertions | Requirement |
|---|-----------------|-------------------|----------------|-------------|
| 1 | [e.g., "NotificationEntity rejects missing recipientId"] | [e.g., `notification.entity.ts`] | [e.g., "Throws ValidationError with field 'recipientId'"] | [e.g., "§2.1"] |

### 5.2 Integration Tests

| # | Scenario | Components Involved | Setup Required | Requirement |
|---|----------|--------------------|--------------------|-------------|
| 1 | [e.g., "End-to-end notification flow"] | [e.g., "API → UseCase → Queue → Worker"] | [e.g., "Test Redis, mock email provider"] | [e.g., "§3.2, §4.1"] |

### 5.3 Edge Cases

| # | Edge Case | Expected Behaviour | Derived From |
|---|-----------|-------------------|--------------|
| 1 | [e.g., "Duplicate request within 1 second"] | [e.g., "Deduplicated — one notification sent"] | [e.g., "PRD §AC-3"] |

[If the test plan does not cover a known edge case, flag it: "⚠️ Gap — {edge case} not covered. Reason: {reason}."]

## 6. Rollback Plan

[Describe how to revert this implementation if issues are discovered after deployment. Address data migrations, feature flags, dependency changes, and configuration changes. The rollback plan must restore the system to its prior working state without data loss.]

- **Code revert:** [e.g., "Revert the merge commit. No conditional logic or feature flags involved — clean revert." or "Disable feature flag `ENABLE_NOTIFICATIONS` to deactivate without code revert."]
- **Data migration rollback:** [e.g., "Run down migration `002_drop_notifications.sql` to remove the new table. No existing data is affected." or "N/A — no data model changes."]
- **Dependency rollback:** [e.g., "Remove `ioredis` from package.json and run `npm install`." or "N/A — no new dependencies introduced."]
- **Configuration rollback:** [e.g., "Remove `REDIS_URL` from `.env` and deployment configs." or "N/A — no configuration changes."]
- **Verification:** [e.g., "After rollback, run `npm test` and verify all pre-existing tests pass. Confirm no orphan database tables remain."]

## 7. Open Risks

[List risks, assumptions, and areas of ambiguity that could affect implementation success. Each item should state the risk, its potential impact, and any proposed mitigation.]

| # | Item | Type | Impact | Mitigation |
|---|------|------|--------|------------|
| 1 | [e.g., "Tech spec §3.2 does not specify retry backoff intervals"] | [Assumption / Risk / Ambiguity] | [e.g., "Incorrect retry timing could cause thundering herd on queue recovery"] | [e.g., "Using exponential backoff (1s, 2s, 4s) — will confirm with architect if not aligned"] |

[If no risks or assumptions exist, state: "No open risks identified — all requirements are unambiguous and fully specified."]
