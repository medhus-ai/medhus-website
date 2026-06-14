# Role Registry

```yaml
roles:
  - name: triager
    type: default
    runner_id: crew-manager
    model: configured-by-runner
    system_prompt_path: .agents/roles/triager.md
    workflow_path: .github/workflows/triager.yml
    commit_identity:
      name: "Triager (AI)"
      email: "triager@bot.local"
    triggers:
      - issues:opened
      - issues:labeled
    active_state_labels:
      - triage-running
      - out-of-scope-recommended
      - needs-scope-decision
      - ready-to-plan
    writes:
      - issue labels
      - issue comments
    escalation_labels:
      - user-review-needed
      - blocked

  - name: crew-manager
    type: default
    runner_id: crew-manager
    model: configured-by-runner
    system_prompt_path: .agents/roles/crew-manager.md
    workflow_path: .github/workflows/crew-manager-build.yml
    commit_identity:
      name: "Crew Manager (AI)"
      email: "crew-manager@bot.local"
    triggers:
      - label transitions
      - issue_comment:created
      - schedule:daily
    active_state_labels:
      - plan-review-running
      - build-coordinating
    writes:
      - issue labels
      - issue comments
      - .agents/log/YYYY-MM-DD.md
    escalation_labels:
      - user-review-needed
      - blocked

  - name: planner
    type: default
    runner_id: crew-manager
    model: configured-by-runner
    system_prompt_path: .agents/roles/planner.md
    workflow_path: .github/workflows/plan-review.yml
    commit_identity:
      name: "Planner (AI)"
      email: "planner@bot.local"
    triggers:
      - cli: gitcrew plan start/continue
      - cockpit: planner UI session
      - issues:labeled:ready-to-plan (Phase E)
    active_state_labels:
      - plan-drafting
      - plan-needs-clarify
      - plan-files-committed
      - plan-needs-revision
    writes:
      - .agents/plans/<issue-id>/*.md
      - issue comments (questions, status)
    escalation_labels:
      - user-review-needed
      - blocked

  - name: code-reviewer
    type: default
    runner_id: code-reviewer
    model: configured-by-runner
    system_prompt_path: .agents/roles/code-reviewer.md
    workflow_path: .github/workflows/code-reviewer.yml
    commit_identity:
      name: "Code Reviewer (AI)"
      email: "code-reviewer@bot.local"
    triggers:
      - pull_request:opened
      - pull_request:synchronize
      - pull_request:ready_for_review
    active_state_labels:
      - code-review-requested
    writes:
      - PR reviews
      - PR comments
      - PR labels
      - checks
    escalation_labels:
      - user-review-needed
      - blocked

  - name: qa-engineer
    type: default
    runner_id: code-reviewer
    model: configured-by-runner
    system_prompt_path: .agents/roles/qa-engineer.md
    workflow_path: not-yet-generated
    commit_identity:
      name: "QA Engineer (AI)"
      email: "qa-engineer@bot.local"
    triggers:
      - pull_request:labeled:code-review-passed (Phase E)
    active_state_labels:
      - human-test
    writes:
      - PR comments with test results
      - new test files
      - new issues for out-of-scope bugs found
    escalation_labels:
      - user-review-needed
      - blocked

  - name: engineer
    type: default
    runner_id: engineer
    model: configured-by-runner
    system_prompt_path: .agents/roles/engineer.md
    workflow_path: .github/workflows/engineer.yml
    commit_identity:
      name: "Engineer (AI)"
      email: "engineer@bot.local"
    triggers:
      - tasks.md row with engineer: engineer (default fallback) reaches building (Phase F)
      - direct-chat invocation via gitcrew chat engineer
    active_state_labels:
      - building
    writes:
      - feature branches
      - commits (prefix [role:engineer])
      - pull requests
    escalation_labels:
      - user-review-needed
      - blocked

  - name: frontend-engineer
    type: specialist
    runner_id: engineer
    model: configured-by-runner
    system_prompt_path: .agents/roles/frontend-engineer.md
    workflow_path: not-yet-generated
    commit_identity:
      name: "Frontend Engineer (AI)"
      email: "frontend-engineer@bot.local"
    triggers:
      - tasks.md row with engineer: frontend-engineer (Phase F)
      - plan-review-running (Phase E)
      - direct-chat via gitcrew chat frontend-engineer
    active_state_labels:
      - building
      - plan-review-running
    writes:
      - feature branches
      - PR review comments
      - plan-review scorecard comments
    escalation_labels:
      - user-review-needed
      - blocked
```
