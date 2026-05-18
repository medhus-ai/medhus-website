# Role Registry

```yaml
roles:
  - name: coordinator
    type: default
    runner_id: coordinator
    model: configured-by-runner
    system_prompt_path: .agents/roles/coordinator.md
    workflow_path: .github/workflows/coordinator-triage.yml
    commit_identity:
      name: "Coordinator (AI)"
      email: "coordinator@bot.local"
    triggers:
      - issues:opened
      - issue_comment:created
      - schedule:daily
    active_state_labels:
      - triage-needed
    writes:
      - issue labels
      - issue comments
      - .agents/log/YYYY-MM-DD.md
    escalation_labels:
      - human-review-needed
      - blocked

  - name: reviewer
    type: default
    runner_id: reviewer
    model: configured-by-runner
    system_prompt_path: .agents/roles/reviewer.md
    workflow_path: .github/workflows/reviewer.yml.disabled
    commit_identity:
      name: "Reviewer (AI)"
      email: "reviewer@bot.local"
    triggers:
      - pull_request:opened
      - pull_request:synchronize
      - pull_request:ready_for_review
    active_state_labels:
      - ready-for-review
    writes:
      - PR reviews
      - PR comments
      - PR labels
      - checks
    escalation_labels:
      - human-review-needed
      - blocked

```
