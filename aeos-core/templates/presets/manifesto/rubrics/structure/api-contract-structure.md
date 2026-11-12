# API Contract Review Structure Rubric

Applied by the reviewer in **API_CONTRACT** to grade the API-contract review: the
findings an agent wrote about an OpenAPI contract a person owns. It checks the
review, not the contract. The pinned spec, decisions and the contract are in
context.

The reviewer applies each criterion independently. Any **FAIL** blocks
advancement; **WARN** must be flagged but does not block.

---

## 1. Every Finding Cites a Source and a Location

| Grade | Definition |
|-------|------------|
| **PASS** | Every finding cites at least one spec id (`AC-n`, `INV-n`, a decision) and a contract location (a path, operation or schema), and every cited id exists. |
| **WARN** | One finding cites the concern loosely (a resource rather than an operation) but the location is still identifiable. |
| **FAIL** | A finding cites no id or no contract location, so the person cannot tell what to change. |

---

## 2. No Finding Drafts the Contract

| Grade | Definition |
|-------|------------|
| **PASS** | Findings describe problems only. None drafts an endpoint, schema, example or replacement wording, and the contract is not rewritten anywhere. |
| **WARN** | A finding hints at a direction ("the error case is unaddressed") without drafting the fix. |
| **FAIL** | A finding writes an endpoint or schema, or the review contains a rewritten contract. The contract is the person's work. |

---

## 3. Severities Are Justified

| Grade | Definition |
|-------|------------|
| **PASS** | Every finding has a severity (BLOCKER, WARNING or INFO) and a stated consequence that matches it: a BLOCKER names what would be built or tested wrong. |
| **WARN** | Severities are present but one justification is thin, or a preference is rated above INFO. |
| **FAIL** | Findings carry no severity, or severities are asserted with no consequence. |

---

## 4. The Four Sections Are Present

| Grade | Definition |
|-------|------------|
| **PASS** | The review has the sections **Coverage**, **Consistency**, **Completeness** and **Testability**, each with findings or an explicit statement that none were found. |
| **WARN** | All four are present but a finding sits in the wrong section. |
| **FAIL** | A section is missing, so it is unknown whether that kind of defect was looked for. |
