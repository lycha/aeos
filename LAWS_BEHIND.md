# Laws Behind the Principles

The [Twelve Principles of AI-Driven Development](https://github.com/lycha/aeos/wiki/Twelve-Principles-of-AI%E2%80%90Driven-Development) rest on laws engineers have known for decades. This page maps each principle to the laws behind it, using the definitions collected in [hacker-laws](https://github.com/dwmkerr/hacker-laws). The full argument is in the [manifesto](https://github.com/lycha/aeos/wiki/AI-Driven-Development-A-Manifesto).

---

### I. Discipline is the control

**[The Broken Windows Theory](https://github.com/dwmkerr/hacker-laws#the-broken-windows-theory).** Visible neglect invites more neglect. Agents copy the patterns they find in a codebase, so the discipline already in the code becomes the agent's instructions, and one bad pattern is repeated at machine speed.

### II. Agents are first-day engineers, every day

**[The Stochastic Parrot](https://github.com/dwmkerr/hacker-laws#the-stochastic-parrot).** A language model produces statistically likely text, and confident output is no evidence that it is correct. An agent needs guardrails because the fluency of its work says nothing about its accuracy.

### III. Humans write the specification

**[Tesler's Law](https://github.com/dwmkerr/hacker-laws#the-law-of-conservation-of-complexity-teslers-law).** Some complexity belongs to the problem itself and can only be moved. Code generation moves that complexity into the specification, where someone who understands the business has to own it.

### IV. Generators build the scaffold, agents write the logic

**[The Law of the Instrument](https://github.com/dwmkerr/hacker-laws#the-law-of-the-instrument).** When all you have is a hammer, everything looks like a nail. A team with a capable model is tempted to use it for everything, including work a deterministic generator does the same way every time.

**[Kernighan's Law](https://github.com/dwmkerr/hacker-laws#kernighans-law).** Debugging is twice as hard as writing the code. Generated code is plain and predictable, which keeps the part a human has to understand small.

### V. Every decision is traceable

**[Chesterton's Fence](https://github.com/dwmkerr/hacker-laws#chestertons-fence).** Understand why something exists before you remove it. An agent can only know why a rule is there if someone wrote the reason down, which is why decision logs live next to the code and a missing decision stops the work.

### VI. Checks run first, review agents second

**[Goodhart's Law](https://github.com/dwmkerr/hacker-laws#goodharts-law).** When a measure becomes a target, it stops being a good measure. An agent rewarded for green tests will find a way to make them green, so the tests and rubrics sit outside the agent's workspace.

**[Kerckhoffs's principle](https://github.com/dwmkerr/hacker-laws#kerckhoffss-principle).** A system should stay secure even when its design is public. Agents may read the rubrics they are judged against, and the protection comes from their inability to change them.

**[Linus's Law](https://github.com/dwmkerr/hacker-laws#linuss-law).** Given enough eyeballs, all bugs are shallow. The review panel works because each reviewer looks at the change for something different.

### VII. Humans hold three gates

**[Hyrum's Law](https://github.com/dwmkerr/hacker-laws#hyrums-law-the-law-of-implicit-interfaces).** Every observable behaviour of a system will be depended on by somebody. API contracts and database schemas outlive any single change, so a human signs off every change to them.

**[Amdahl's Law](https://github.com/dwmkerr/hacker-laws#amdahls-law).** Adding parallel workers only speeds up the part of the work that can run in parallel. Agents run in parallel and human gates run one at a time, so the gates set the pace, and every gate that earns autonomy speeds up the whole pipeline.

### VIII. Deploy continuously, release deliberately

**[Murphy's Law](https://github.com/dwmkerr/hacker-laws#murphys-law--sods-law).** Anything that can go wrong will go wrong. Deployment runs without a human only because automated rollback and detailed monitoring assume that something will break.

### IX. Ceremony scales with the change

**[Gall's Law](https://github.com/dwmkerr/hacker-laws#galls-law).** A complex system that works always grew from a simple system that worked. Specifications are sliced small, and each slice is released and measured before the next one builds on it.

**[All Models Are Wrong](https://github.com/dwmkerr/hacker-laws#all-models-are-wrong-george-boxs-law).** Every model is wrong and some are useful. A specification is a model of what users need, so it is amended as often as the team learns something new.

### X. The engineer owns the blueprint

**[Conway's Law](https://github.com/dwmkerr/hacker-laws#conways-law).** Systems mirror the structure of the organisation that builds them. The pipeline's stages, its reviewers and the split between the Product Manager and the Product Engineering Architect are now part of that organisation, so they are designed on purpose.

### XI. Junior engineers are grown on purpose

**[The Law of Leaky Abstractions](https://github.com/dwmkerr/hacker-laws#the-law-of-leaky-abstractions).** Every non-trivial abstraction leaks. Generated scaffolds and agents are abstractions too, and an engineer who has never built code by hand cannot see where they leak, which is why juniors start by writing some code themselves.

### XII. The system learns from measurement

**[Twyman's Law](https://github.com/dwmkerr/hacker-laws#twymans-law).** The more surprising the data, the more likely it is an error. A dramatic productivity gain from an AI rollout is treated as a measurement problem until the numbers are checked.

**[Jevons' Paradox](https://github.com/dwmkerr/hacker-laws#jevons-paradox).** When something gets cheaper, people use more of it. Cheaper code leads to more code and more demand for review, so model spend and review capacity are tracked from the start.

---

## Laws the critics will cite

**[The Bitter Lesson](https://github.com/dwmkerr/hacker-laws#the-bitter-lesson).** Richard Sutton argues that general methods that scale with compute beat hand-built structure. A critic will say specifications and constraints are hand-built structure that larger models will make obsolete. The specification records what the business wants, and that information has to come from people however capable the model becomes. The manifesto leaves the model's reasoning free and constrains only its output.

**[Cunningham's Law](https://github.com/dwmkerr/hacker-laws#cunninghams-law).** The fastest way to the right answer is to post a wrong one. Some teams let an agent write a rough first draft of the spec and then correct it. The manifesto keeps humans drafting, because missing requirements are the hardest thing to spot in a draft someone else wrote.

**[The Shirky Principle](https://github.com/dwmkerr/hacker-laws#the-shirky-principle).** Institutions preserve the problem they solve. A pipeline full of gates can turn into bureaucracy that protects itself. Gates earn autonomy from evaluation data and lose it after an escaped defect, so every gate has to keep justifying itself with evidence.
