---
purpose: the rubric every installed specialist uses to score a plan
audience: planner (apply), specialists (score), crew-manager (aggregate + gate)
edit: humans add/remove metrics, change thresholds, change which roles rate which metric
---

# Plan Rubric

Each specialist installed in the project scores every metric 0–10 and posts
a scorecard comment with a one-line justification per metric. The crew-manager
aggregates and gates the plan-review state machine.

## Gate rule

- Pass = **all metrics** at or above their threshold from **at least one
  specialist**, AND no specialist flagged a P0 blocker.
- Below threshold on pass 1 → one automated revision pass to the planner
  → pass 2 review → control transfers to human regardless of outcome.
- Human can re-trigger any single (role × metric) cell with
  `/re-review <role> <metric>`.

## Default metrics

```yaml
metrics:
  - id: clarity
    description: A fresh human or agent can implement the plan without major doubts
    threshold: 7
    assigned_roles: all
  - id: assumptions_surfaced
    description: All load-bearing premises are explicit; nothing hidden
    threshold: 7
    assigned_roles: all
  - id: simplicity
    description: No abstractions, options, or flags unjustified by the issue
    threshold: 7
    assigned_roles: all
  - id: scope_discipline
    description: No orthogonal / drive-by additions; touches only what is needed
    threshold: 7
    assigned_roles: all
  - id: verifiability
    description: Success criteria are measurable; tests are listed
    threshold: 7
    assigned_roles: all
  - id: code_rule_fit
    description: Plan upholds the minimal / efficient / modular / readable rules
    threshold: 7
    assigned_roles: all
```

## Optional metrics to add per-project

- `reversibility` — clear rollback path if the change is wrong
- `security_posture` — when `security` specialist is installed
- `accessibility` — when `frontend-engineer` is installed and the surface is user-facing
- `reproducibility` — when `ml-engineer` is installed
- `image_size` / `layer_caching` — when `container-engineer` is installed

Project edits this file directly or via:

```
gitcrew rubric add <metric-id> --description "..." --threshold N --roles role1,role2
gitcrew rubric remove <metric-id>
gitcrew rubric set-threshold <metric-id> N
```

## Scorecard output shape

Specialists post their scorecard as a single GitHub comment on the plan-review
issue. Format:

```
### Plan scorecard — <role-name>

| Metric | Score | Justification |
|---|---|---|
| clarity | 8 | Decisions doc covers every fork; tasks unambiguous |
| assumptions_surfaced | 6 | Background worker concurrency assumption not stated |
| simplicity | 9 | No premature abstractions |
| scope_discipline | 10 | Stays in declared file scope |
| verifiability | 5 | Tests listed but acceptance criteria for T3 missing |
| code_rule_fit | 8 | Modular split clean; minor over-comment risk in T2 |

**P0 blockers:** none
**Required changes:** restate worker concurrency assumption; add T3 acceptance criteria
**Optional notes:** consider splitting T2 if it grows
```
