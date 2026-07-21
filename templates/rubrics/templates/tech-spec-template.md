# Technical Specification: {ticket title}

## 1. Overview

[1–2 paragraph summary of what will be built. Reference the architecture spike decisions that inform this specification. State the scope — what is included and what is explicitly excluded. Identify the PRD requirements this spec addresses.]

## 2. Component Architecture

[Decompose the system into its structural units — components, modules, or services. Each component must be named, its responsibility described, and its relationships to other components stated explicitly. Use a diagram (Mermaid, ASCII) or a structured list.]

### 2.1 {Component Name}

- **Responsibility:** [Single-sentence description of what this component does and why it exists.]
- **Location:** [File path or module path, e.g., `src/infrastructure/queue/redis-queue.adapter.ts`]
- **Dependencies:** [List dependencies with direction, e.g., "Depends on → `ConfigService`; Depended on by ← `NotificationUseCase`"]
- **Public API:** [Key functions/methods with full type signatures, e.g., `enqueue(message: QueueMessage): Promise<void>`]

[Repeat `### 2.N {Component Name}` for each component. Every component that will be created or modified must appear here.]

## 3. API Contracts

[Define the interfaces between components, and between the system and external consumers. Each endpoint or interface must include method, schema, and error cases. Use concrete types — no unresolved `any` or `object`.]

### 3.1 {Endpoint / Interface Name}

- **Method / Signature:** [e.g., `POST /api/v1/notifications` or `function sendNotification(input: SendNotificationInput): Promise<NotificationResult>`]
- **Request / Input:**
  ```typescript
  // [Full request schema or type definition with field-level descriptions]
  interface SendNotificationInput {
    recipientId: string;   // UUID of the target user
    channel: 'email' | 'push';  // Delivery channel
    templateId: string;    // Reference to notification template
    variables: Record<string, string>;  // Template interpolation values
  }
  ```
- **Response / Output:**
  ```typescript
  // [Full response schema for success case]
  interface NotificationResult {
    id: string;            // Notification ID for tracking
    status: 'queued' | 'sent' | 'failed';
    createdAt: string;     // ISO 8601 timestamp
  }
  ```
- **Error Cases:**
  | Status Code | Error Code | Condition | Response Shape |
  |-------------|------------|-----------|----------------|
  | [e.g., 400] | [e.g., `INVALID_CHANNEL`] | [e.g., "Channel is not 'email' or 'push'"] | [e.g., `{ error: string, code: string }`] |
  | [e.g., 404] | [e.g., `RECIPIENT_NOT_FOUND`] | [e.g., "recipientId does not match a known user"] | [e.g., `{ error: string, code: string }`] |

[Repeat `### 3.N` for each endpoint or interface. If no APIs are involved, state: "No API contracts — this change is internal to a single module."]

## 4. Data Model

[Define all new or modified data entities. Include field names, types, constraints (nullability, uniqueness, defaults), and relationships (foreign keys, references). Use TypeScript interfaces, SQL DDL, or equivalent concrete notation.]

### 4.1 {Entity / Table Name}

```typescript
// [Full entity definition with field-level constraints]
interface NotificationRecord {
  id: string;              // PK, UUID v4, auto-generated
  recipientId: string;     // FK → users.id, NOT NULL
  channel: 'email' | 'push';  // NOT NULL
  status: 'pending' | 'sent' | 'failed';  // NOT NULL, default 'pending'
  payload: JsonObject;     // NOT NULL, stores rendered content
  createdAt: Date;         // NOT NULL, auto-generated
  sentAt: Date | null;     // NULL until delivery confirmed
}
```

**Indexes:** [List indexes required for query performance, e.g., `CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, created_at DESC);`]

**Constraints:** [List unique constraints, check constraints, foreign keys.]

[Repeat `### 4.N` for each entity. If no data model changes are required, state: "No data model changes — this specification does not introduce or modify persistent data structures."]

### 4.X Migration Strategy

[If existing data is affected, describe the migration approach:]

- **Migration type:** [e.g., "Additive — new table, no existing data affected" or "Destructive — column type change requires data transformation"]
- **Rollback plan:** [How to reverse the migration if deployment fails]
- **Data backfill:** [Whether existing records need transformation and the approach]
- **Downtime impact:** [Whether the migration can run online or requires maintenance window]

[If no migration is needed, state: "No migration required — all changes are additive with no impact on existing data."]

## 5. Error Handling Strategy

[Define how errors are detected, classified, propagated, and reported across the system. Address both expected failures and unexpected infrastructure errors.]

### 5.1 Error Categories

| Category | Examples | Handling Strategy | User / Caller Impact |
|----------|----------|-------------------|---------------------|
| [e.g., Validation errors] | [e.g., "Missing required field, invalid enum value"] | [e.g., "Return 400 immediately with field-level error details"] | [e.g., "Client receives structured error with corrective guidance"] |
| [e.g., Infrastructure failures] | [e.g., "Database connection timeout, queue unavailable"] | [e.g., "Retry with exponential backoff (3 attempts, 1s/2s/4s), then circuit-break"] | [e.g., "Client receives 503 with Retry-After header"] |
| [e.g., Domain errors] | [e.g., "Recipient has unsubscribed, template not found"] | [e.g., "Return domain-specific error code, log for monitoring"] | [e.g., "Client receives 422 with actionable error code"] |

### 5.2 External Dependency Failures

[For each external dependency (database, queue, third-party API), describe:]

- **{Dependency name}:** [Failure mode] → [Detection mechanism] → [Recovery strategy] → [Fallback behaviour if recovery fails]

[If no external dependencies exist, state: "No external dependencies — all operations are self-contained."]

## 6. Dependencies

[List all new runtime and build-time dependencies introduced by this change. Include version constraints, selection rationale, and license information.]

| Dependency | Version | Purpose | License | New? |
|------------|---------|---------|---------|------|
| [e.g., `ioredis`] | [e.g., `^5.3.0`] | [e.g., "Redis client for notification queue"] | [e.g., MIT] | [e.g., Yes — new addition] |
| [e.g., `zod`] | [e.g., `^3.22.0`] | [e.g., "Request validation schemas"] | [e.g., MIT] | [e.g., No — already in project] |

[If no new dependencies are introduced, state: "No new dependencies — implementation uses only existing project dependencies."]

## 7. Test Strategy

### 7.1 Unit Tests

[List key unit tests to write. Each must reference a specific component and a specific behaviour to verify.]

| Component | Test Description | Key Assertions |
|-----------|-----------------|----------------|
| [e.g., `NotificationUseCase`] | [e.g., "Validates input and rejects missing recipientId"] | [e.g., "Throws ValidationError with field name"] |
| [e.g., `RedisQueueAdapter`] | [e.g., "Enqueues message with correct serialization"] | [e.g., "Message matches expected JSON shape"] |

### 7.2 Integration Tests

[List integration tests that verify component interactions across boundaries.]

| Scenario | Components Involved | Setup / Fixtures Required |
|----------|--------------------|-----------------------------|
| [e.g., "End-to-end notification delivery"] | [e.g., "API → UseCase → Queue → Worker"] | [e.g., "Test Redis instance, mock email provider"] |

### 7.3 Edge Cases

[List edge cases derived from PRD acceptance criteria and error handling requirements.]

| # | Edge Case | Expected Behaviour | Derived From |
|---|-----------|-------------------|--------------|
| 1 | [e.g., "Duplicate notification request within 1 second"] | [e.g., "Deduplicated — only one notification sent"] | [e.g., "PRD §AC-3"] |
| 2 | [e.g., "Recipient has no email on file but channel is 'email'"] | [e.g., "Returns 422 RECIPIENT_NO_EMAIL"] | [e.g., "PRD §AC-7"] |

## 8. Implementation Plan

[Ordered list of implementation steps. Each step should be small enough to implement and test independently. Steps should respect dependency order.]

| Step | Description | Files to Create / Modify | Depends On |
|------|-------------|--------------------------|------------|
| 1 | [e.g., "Define data model interfaces and migration"] | [e.g., `src/domain/notification.entity.ts`, `migrations/001_notifications.sql`] | [e.g., "None"] |
| 2 | [e.g., "Implement queue adapter"] | [e.g., `src/infrastructure/queue/redis-queue.adapter.ts`] | [e.g., "Step 1"] |

## 9. Deviations from Architecture Spike

[List any deviations from the architecture spike decisions with justification. For each deviation, state what was decided in the spike, what this spec proposes instead, and why the change is warranted.]

| Spike Decision | Spec Deviation | Justification |
|---------------|----------------|---------------|
| [e.g., "Spike recommended RabbitMQ"] | [e.g., "Spec uses Redis Streams"] | [e.g., "Team already operates Redis; adding RabbitMQ increases operational burden without proportional benefit for current scale"] |

[If no deviations, state: "None — implementation follows the architecture spike as written."]
