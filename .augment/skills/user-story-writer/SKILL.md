---
name: user-story-writer
description: 'Turn features into sprint-ready stories that are Independent, Negotiable, Valuable, Estimable, Small, and Testable. Use when: write user stories, user story, acceptance criteria, story points.'
---

# User Story Writer

Turn features into sprint-ready stories that are Independent, Negotiable, Valuable, Estimable, Small, and Testable.

## Output
Save to `specs/outputs/user-stories-[feature]-[YYYY-MM-DD].md`

## When to Use This Skill
- Writing stories during backlog grooming
- Translating PRD requirements into sprint-ready stories
- Training junior PMs on good story format

## What You'll Need
- Description of the feature or capability
- Context on the user and their goal

## Process

### Step 1: I'll Check Your Context First
I'll automatically check your context files:
- **personas.md** — To identify which persona this story serves and their job-to-be-done
- **product.md** — To connect the story to your roadmap

I'll tell you what I found so you know what I'm working with. For example:
> "I found your Jordan persona (PM) in personas.md. Their main frustration is 'spending 5+ hours/week updating spreadsheets.' I'll write the user story from Jordan's perspective."

### Step 2: Gather Feature Details
If the user hasn't provided enough context, ask:
> "I need to understand the capability before writing stories:
> 1. What feature or capability are we adding?
> 2. Which persona is this for? (I found [X] in your personas.md)
> 3. What's the user trying to accomplish?
>
> Or point me to a PRD if you have one."

### Step 3: Format as User Story
```
As a [user type from personas.md],
I want to [action/capability],
So that [benefit/outcome].
```

### Step 4: Validate Against INVEST
- **I**ndependent: Can be delivered alone
- **N**egotiable: Details can be discussed
- **V**aluable: Delivers user value
- **E**stimable: Team can estimate effort
- **S**mall: Fits in a sprint
- **T**estable: Has clear pass/fail criteria

### Step 5: Write Acceptance Criteria
Use Given/When/Then format (BDD):
```
Given [context],
When [action],
Then [expected result].
```

### Step 6: Identify Edge Cases
What could go wrong? What are the boundaries?

## Output Template

```markdown
# User Story: [Short Title]

## Context
*What I found in your files:*
- **Persona:** [From personas.md]
- **Persona JTBD:** [Their job-to-be-done]
- **Related feature:** [From product.md if applicable]

## Story
**As a** [user type from personas.md],
**I want to** [action],
**So that** [benefit — connect to persona goals/frustrations].

## INVEST Checklist
*I'll validate each criterion and note any concerns:*

- [x] **Independent** — Can be delivered without dependencies on other stories
- [x] **Negotiable** — Implementation details are flexible
- [x] **Valuable** — Delivers [specific user value from persona]
- [x] **Estimable** — Clear scope allows team to estimate effort
- [x] **Small** — Can be completed in a single sprint
- [x] **Testable** — Has clear acceptance criteria below

## Acceptance Criteria

### AC1: [Happy Path]
**Given** [context],
**When** [action],
**Then** [expected result].

### AC2: [Alternate Path]
**Given** [context],
**When** [action],
**Then** [expected result].

### AC3: [Error State]
**Given** [context],
**When** [action],
**Then** [expected result].

## Edge Cases
- [Edge case 1] — Expected behavior: [X]
- [Edge case 2] — Expected behavior: [X]

## Technical Notes
- [Note for engineering — pull from product.md if relevant]

## Out of Scope
- [What this story does NOT include]

## Related Context
- **Persona pain point:** [From personas.md]
- **Roadmap item:** [From product.md if applicable]
```

## Framework Reference
**INVEST criteria** (Bill Wake) with **BDD acceptance criteria**:
- Stories should be Independent, Negotiable, Valuable, Estimable, Small, Testable
- Acceptance criteria use Given/When/Then for clarity

## Tips for Best Results
1. **Use your personas** — I'll write stories from their perspective with their language
2. **Connect to JTBD** — "So that" should link to persona goals
3. **Be specific on edge cases** — These often become bugs later
4. **Keep stories small** — If it can't be done in a sprint, decompose it
