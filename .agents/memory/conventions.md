---
purpose: project-wide coding rules and review checks every role must honor
audience: every role (read-first), reviewer (enforce), planner (apply to rubric)
---

# Conventions

Every role MUST read this file before acting. The rules below are non-negotiable
unless the human explicitly overrides them on a specific task.

## Coding rules (in priority order)

1. **Minimal** — write the least code that satisfies the acceptance criteria.
   Do not add abstractions, options, flags, or error handling for scenarios
   that cannot happen. Trust internal code and framework guarantees. Validate
   only at system boundaries.

2. **Efficient** — favor straightforward algorithms over premature optimization,
   but never ship known-quadratic code where linear is obvious. Measure if
   uncertain; do not guess.

3. **Modular** — one file, one responsibility. Functions short and named for
   what they return, not how they work. Cross-module coupling only through
   declared interfaces.

4. **Readable** — a fresh engineer must understand the code without the author
   present. Use well-named identifiers; resist clever code; default to writing
   NO comments. Only add a comment when the WHY is non-obvious (hidden
   constraint, subtle invariant, workaround for a specific bug).

## Karpathy checks (every plan and every PR)

These four failure modes must be actively guarded against:

1. **Wrong assumptions** — every load-bearing premise must be stated explicitly.
   If you are about to act on an unstated assumption, ask first.

2. **Overcomplexity** — no abstraction, option, or flag without a concrete
   justification tied to the issue. Defer "what if we later need X" until
   later actually arrives.

3. **Orthogonal edits** — touch only the files the task requires. Drive-by
   refactors, lint fixes, or formatting changes belong in their own PRs.

4. **Imperative over declarative** — replace "do this then that" prose with
   verifiable goals and tests. The plan must include success criteria a
   third party could check without asking questions.

## What NOT to do

- Do not write multi-paragraph docstrings or multi-line comment blocks.
- Do not reference current PRs, issues, or callers in code comments — those
  belong in commit messages and PR descriptions and rot quickly.
- Do not add error handling for impossible conditions.
- Do not introduce dependencies without explicit human approval.
- Do not skip hooks (`--no-verify`), bypass signing, or take other actions
  that defeat repository safety nets.
