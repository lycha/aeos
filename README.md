<a id="readme-top"></a>

<!--
  Root README for AEOS. Structure adapted from othneildrew/Best-README-Template.
  This page is about the manifesto and its documents; the CLI implementation
  lives in aeos-core/. Shields use reference-style links defined at the bottom.
-->

[![License: Apache 2.0][license-shield]][license-url]
[![PRs Welcome][prs-shield]][prs-url]
[![Status: WIP][wip-shield]][wip-url]

<div align="center">

# ☀️🐎 AEOS

### AI-Driven Development — a manifesto, its principles, and the laws behind them

**A stand on how AI changes the way we build software: constrain the output, not the reasoning.
Humans write the specification and own the contracts and the release; generators build everything
deterministic; agents fill the rest inside guardrails; and work is done when it is rolled out,
observed and measured.**

[Manifesto](AI_MANIFESTO.md) &middot;
[Principles](12_PRINCIPLES.md) &middot;
[Laws](LAWS_BEHIND.md) &middot;
[Tooling](SUGGESTED_TOOLING.md)

</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about">About</a></li>
    <li><a href="#the-twelve-principles">The Twelve Principles</a></li>
    <li><a href="#the-documents">The Documents</a></li>
    <li><a href="#aeos--the-implementation">AEOS — The Implementation</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT -->
## About

In Greek myth, **Aeos** (Ἠώς) is one of the four horses that pull Helios' Sun Chariot across the
sky — pure power, held on a fixed course by its driver. That is the stance of this project:
**the human holds the reins; the agents do the pulling.**

AEOS began as an argument, not a tool. Its premise is that **AI makes the engineering discipline of
the last forty years *more* valuable, not less**. Domain-driven design, explicit contracts, tests,
feature flags and continuous delivery are exactly the controls that keep agent output correct — so
the right response to capable agents is to double down on discipline and treat every agent like a
capable engineer on their first day, *every day*: it remembers nothing between runs and sees only
what has been written down, so you write everything down.

This repository holds that argument in full — the **[manifesto](AI_MANIFESTO.md)**, the **[twelve
principles](12_PRINCIPLES.md)** it distils into, the **[engineering laws](LAWS_BEHIND.md)** each
principle rests on, and the **[suggested tooling](SUGGESTED_TOOLING.md)** for enforcing them — plus a
reference implementation ([`aeos-core/`](aeos-core/)) that puts the principles to work.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- THE TWELVE PRINCIPLES -->
## The Twelve Principles

> Humans write the specification and own the contracts and the release; generators build everything
> deterministic; agents fill the rest inside guardrails; and work is done when it is rolled out,
> observed and measured.

Each title links to its **enforcement tooling** — a reference architecture, CI gates and tool
comparisons for turning the principle into a control a machine checks:

1. [Discipline is the control](tooling/principles/PRINCIPLE-01-discipline-is-the-control.md)
2. [Agents are first-day engineers, every day](tooling/principles/PRINCIPLE-02-agents-are-first-day-engineers.md)
3. [Humans write the specification](tooling/principles/PRINCIPLE-03-humans-write-the-specification.md)
4. [Generators build the scaffold, agents write the logic](tooling/principles/PRINCIPLE-04-generators-build-the-scaffold.md)
5. [Every decision is traceable](tooling/principles/PRINCIPLE-05-every-decision-is-traceable.md)
6. [Checks run first, review agents second](tooling/principles/PRINCIPLE-06-checks-first-review-agents-second.md)
7. [Humans hold three gates](tooling/principles/PRINCIPLE-07-humans-hold-three-gates.md)
8. [Deploy continuously, release deliberately](tooling/principles/PRINCIPLE-08-deploy-continuously-release-deliberately.md)
9. [Ceremony scales with the change](tooling/principles/PRINCIPLE-09-ceremony-scales-with-the-change.md)
10. [The engineer owns the blueprint](tooling/principles/PRINCIPLE-10-engineer-owns-the-blueprint.md)
11. [Junior engineers are grown on purpose](tooling/principles/PRINCIPLE-11-junior-engineers-grown-on-purpose.md)
12. [The system learns from measurement](tooling/principles/PRINCIPLE-12-system-learns-from-measurement.md)

Read them in full, with the reasoning for each, in **[12_PRINCIPLES.md](12_PRINCIPLES.md)**.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- THE DOCUMENTS -->
## The Documents

| Document | What's in it |
| --- | --- |
| [**AI-Driven Development — Manifesto**](AI_MANIFESTO.md) | The full argument for how agents and the modern SDLC fit together, and the belief AEOS is built to enforce. |
| [**The Twelve Principles**](12_PRINCIPLES.md) | The manifesto distilled into twelve enforceable principles. |
| [**Laws Behind the Principles**](LAWS_BEHIND.md) | The engineering laws (Conway's, Chesterton's Fence, Amdahl's, …) each principle rests on. |
| [**Suggested Tooling**](SUGGESTED_TOOLING.md) | One document per principle on how to *enforce* it — reference architectures, CI gates and tool comparisons, plus worked code-generation scaffolds under [`tooling/`](tooling/). |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- AEOS — THE IMPLEMENTATION -->
## AEOS — The Implementation

> **🚧 Under active development.**

[**`aeos-core/`**](aeos-core/) is the reference implementation of these principles: **AEOS**, the
*Agentic Engineering Operating System* — a CLI that drives a ticket from idea to reviewed code
through LLM-agent pipelines, where every stage has a worker agent, a reviewer agent with
machine-readable rubrics, and a human approval gate, and the orchestrator that decides what runs
next is a deterministic function that never merges a PR and never clears the final human gate. It is
an early work in progress, built principle-by-principle (and it dogfoods itself). See the
**[`aeos-core/` README](aeos-core/README.md)** for how it works and how to run it.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

The manifesto is a position, not scripture — challenges, counter-examples and refinements are
welcome. Open an [issue](https://github.com/lycha/aeos/issues) to discuss a principle or a law, or
fork and open a pull request:

1. Fork the project
2. Create your branch (`git checkout -b suggestion/amazing-idea`)
3. Commit your changes (`git commit -m 'docs: refine principle VII'`)
4. Push to the branch (`git push origin suggestion/amazing-idea`)
5. Open a Pull Request

For changes to the `aeos-core/` code, follow the contribution notes in its
[own README](aeos-core/README.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->
## License

Distributed under the **Apache License 2.0**. See [`aeos-core/LICENSE`](aeos-core/LICENSE) for the
full text.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->
## Contact

Krzysztof Jackowski — [@lycha](https://github.com/lycha)

Project Link: [https://github.com/lycha/aeos](https://github.com/lycha/aeos)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) — the structure this page follows
- [How to write a beautiful and meaningful README](https://dev.to/silentlad/how-to-write-beautiful-and-meaningful-readme-md-jp3)
- [Shields.io](https://shields.io) — the badges above

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[license-shield]: https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge
[license-url]: aeos-core/LICENSE
[prs-shield]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge
[prs-url]: https://github.com/lycha/aeos/pulls
[wip-shield]: https://img.shields.io/badge/status-work_in_progress-ff8c00.svg?style=for-the-badge
[wip-url]: https://github.com/lycha/aeos
