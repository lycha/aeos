# Schema Review Structure Rubric

Applied by the reviewer in **SCHEMA** to grade the schema review: the findings an
agent wrote about an ERD or SQL schema a person owns. It checks the review, not
the schema. The pinned spec, decisions, domain model and the schema are in
context.

The reviewer applies each criterion independently. Any **FAIL** blocks
advancement; **WARN** must be flagged but does not block.

---

## 1. Every Finding Cites a Source and a Schema Object

| Grade | Definition |
|-------|------------|
| **PASS** | Every finding cites at least one spec id (`AC-n`, `INV-n`, a decision) and a schema object (a table, column or constraint), and every cited id exists. |
| **WARN** | One finding cites the concern loosely (a table rather than a column) but the object is still identifiable. |
| **FAIL** | A finding cites no id or no schema object, so the person cannot tell what to change. |

---

## 2. No Finding Drafts the Schema

| Grade | Definition |
|-------|------------|
| **PASS** | Findings describe problems only. None drafts a table, column, constraint or migration, and the schema is not rewritten anywhere. |
| **WARN** | A finding hints at a direction ("nothing enforces uniqueness here") without drafting the DDL. |
| **FAIL** | A finding writes a table or constraint, or the review contains a rewritten schema. The schema is the person's work. |

---

## 3. Invariant Findings Name the State They Allow

| Grade | Definition |
|-------|------------|
| **PASS** | Every invariant finding names the illegal state the schema would permit (an orphan row, a duplicate, a null that must not be null) and the invariant id it breaks. |
| **WARN** | An invariant finding is real but states the risk only in general terms. |
| **FAIL** | An invariant finding asserts a problem with no illegal state named, so its severity cannot be judged. |

---

## 4. The Four Sections Are Present

| Grade | Definition |
|-------|------------|
| **PASS** | The review has the sections **Coverage**, **Invariants**, **Consistency** and **Persistence fit**, each with findings or an explicit statement that none were found. |
| **WARN** | All four are present but a finding sits in the wrong section. |
| **FAIL** | A section is missing, so it is unknown whether that kind of defect was looked for. |
