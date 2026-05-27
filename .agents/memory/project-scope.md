---
purpose: declare what this project does and does not do
audience: triager (scope verdict), planner (frame work), every role (sanity check)
edit: humans edit freely; agents read-only
---

# Project Scope

> **Required.** The triager reads this on every new issue to decide whether
> to auto-plan or post an out-of-scope recommendation. An empty scope file
> means every issue defaults to "ambiguous → ask human", which is noisy.
> Fill this in early.

## In scope

What this project IS for. One bullet per capability.

- <e.g. expose REST API for X>
- <e.g. ingest data from Y>
- <...>

## Out of scope

What this project IS NOT for. Be specific — vague non-goals trap the
triager into "ambiguous" every time.

- <e.g. user-facing UI (handled by sibling repo `medhus-website`)>
- <e.g. payment processing (delegated to Stripe)>
- <...>

## Adjacent (track, do not commit)

Ideas that may eventually belong here but are not committed. Triager
treats issues that fall here as `defer-needs-roadmap`.

- <e.g. real-time streaming variant>
- <...>

## Stack constraints

Hard constraints the plan and the assigned engineer must respect.

- Language: <e.g. Node.js 20>
- Framework: <e.g. Fastify>
- Dependencies: <minimize new ones; ask before adding>
- Deploy target: <e.g. Pi via Doppler>
