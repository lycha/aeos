# Conflict Checklist

Run this **before** the absence checklist. A vocabulary conflict makes half your absence descriptions ambiguous, so resolving conflicts first is not a preference — it is an ordering constraint.

An absence is *nobody decided*. A conflict is *somebody decided, twice, incompatibly*. They fail differently: an absence gets hallucinated, a conflict gets **forked** — two sources each produce a consistent downstream artefact, and the artefacts disagree.

Compare every pair of sources across each category below.

---

## 1. Vocabulary

The most common and the most expensive, because it forks everything.

- Does each source use the same word for the same entity?
- Does the prototype use **one vocabulary in copy and another in identifiers**? Check `onXDropZone`, handler names, CSS classes, data attributes — designers rename copy long before anyone renames code.
- Does the codebase use a term the conventions file marks as retired?
- Is the PRD written in a vocabulary that has since been abandoned?
- Does one name cover two concepts, or two names cover one?

**Every vocabulary conflict is `blocking` by default.** API paths, table names, event names, type names, ticket titles and UI copy all fork here, and unforking them later is a rename across every layer.

## 2. Behaviour

- Do two sources describe different outcomes for the same trigger?
- Does the prototype show a flow the stories do not mention, or vice versa?
- Does the codebase already implement something the PRD describes differently?

## 3. Scope

- Does one source include a capability another excludes?
- Is something in the prototype that no story covers? (Design speculation, or a missing story — determine which.)
- Is there a story with no prototype support?

## 4. Data shape

- Same entity, different fields across sources?
- Same field, different type, format, or optionality?
- Different identifiers — slug in one place, numeric id in another?
- Different cardinality — one-to-many in the schema, one-to-one in the UI?

## 5. State model

- Do the sources agree on how many states exist?
- Same state name, different meaning? (`draft` meaning unsaved versus unpublished.)
- Different transitions permitted between the same states?

## 6. Permission and role

- Do the sources name the same roles?
- Does the PRD grant something the codebase restricts?
- Does the prototype show an action to a role the stories say cannot perform it?

## 7. Staleness

Not strictly a conflict — a versioning failure that looks like one.

- Is one source simply an older revision that nobody retired?
- Does a source carry a `version_note` indicating it superseded another?
- Is the PRD predating a pivot still being treated as authoritative?

**Mark these `kind: stale` rather than forcing them into another category.** The resolution is different: retire the source, don't decide between positions.

---

## Recording a conflict well

**Weak:** "Sources use different terminology."

**Strong:**

> **Four vocabularies for one entity.** PRD uses *declaration*/*Representative*; stories use *brief*; prototype uses *brief* in copy but *wrap* in identifiers; CLAUDE.md retires *wrap*, *declaration* and *Representative* explicitly. The PRD is written almost entirely in the retired set. API contract, table names, event names, UI copy and tickets all fork here.

The strong version states every position, names the authority, and says what breaks. That is enough for precedence to resolve it without a meeting — or, where it isn't, enough for the session to resolve it in two minutes instead of fifteen.

---

## Applying precedence

`meta.source_precedence` is declared once per project. Typical ordering, highest first:

1. **Conventions** (`CLAUDE.md`, coding standards) — explicitly authoritative about naming and retirement
2. **Codebase** — what is actually true today
3. **Prototype** — most recent product thinking, usually
4. **Stories** — often a rewrite, check `version_note`
5. **PRD** — oldest, drifts fastest

Compute `default_resolution` from precedence. Then set `requires_human: true` when any of these hold:

- Precedence is silent on this dimension
- The winning source looks stale
- **Resolution creates work someone must own** — a rename, a migration, a PRD rewrite
- Resolving it changes product behaviour rather than just naming

The last two are why a conflict with a clean precedence answer can still need a human. Precedence tells you which word wins; it does not tell you who is renaming `lib/wraps/` or when.
