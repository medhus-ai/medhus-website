#!/usr/bin/env node
const { mkdirSync, readFileSync, writeFileSync, existsSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const args = parseArgs(process.argv.slice(2));
const now = new Date();
const month = now.toISOString().slice(0, 7);
const timestamp = now.toISOString();
const startedAtValue = typeof args["started-at"] === "string" && args["started-at"].trim()
  ? args["started-at"]
  : null;
const startedAt = startedAtValue ? new Date(startedAtValue) : now;
const startedAtMs = Number.isNaN(startedAt.getTime()) ? now.getTime() : startedAt.getTime();
const durationSeconds = Math.max(0, Math.round((now.getTime() - startedAtMs) / 1000));
const budgetPath = resolveBudgetPath(month, { create: true });

if (!args.workflow || !args.result) {
  console.error("usage: budget-record.sh --workflow NAME --result RESULT [--issue N|--pr N|--scope repo] [--runner ID] [--provider NAME] [--started-at ISO]");
  process.exit(2);
}

mkdirSync(path.dirname(budgetPath), { recursive: true });

const budget = normalizeBudget(month, existsSync(budgetPath)
  ? JSON.parse(readFileSync(budgetPath, "utf8"))
  : defaultBudget(month));

const target = targetKey(args);
const retryCount = retryCountForTarget(budget, target);

budget.runs = Array.isArray(budget.runs) ? budget.runs : [];
budget.runs.push({
  timestamp,
  workflow: String(args.workflow),
  repository: process.env.GITHUB_REPOSITORY || path.basename(process.cwd()),
  runner_id: args.runner ? String(args.runner) : null,
  provider: args.provider ? String(args.provider) : null,
  issue_or_pr: target,
  actor: process.env.GITHUB_ACTOR || args.actor || null,
  result: String(args.result),
  duration_seconds: durationSeconds,
  retry_count_after_run: retryCount,
  estimated_input_tokens: null,
  estimated_output_tokens: null,
  provider_reported_cost_usd: null
});

writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`, "utf8");
console.log(`budget recorded: ${args.workflow} ${args.result} ${target}`);

function targetKey(values) {
  if (values.issue) return `issue-${values.issue}`;
  if (values.pr) return `PR-${values.pr}`;
  return values.scope ? String(values.scope) : "repo";
}

function retryCountForTarget(budget, target) {
  return (budget.runs || [])
    .filter((run) => String(run.issue_or_pr) === target)
    .reduce((max, run) => Math.max(max, Number(run.retry_count_after_run || 0)), 0);
}

function resolveBudgetPath(value) {
  const globalDir = process.env.GITCREW_BUDGET_DIR
    ? path.resolve(process.env.GITCREW_BUDGET_DIR)
    : path.join(os.homedir(), ".gitcrew", "budget");
  return path.join(globalDir, `${value}.json`);
}

function defaultBudget(value) {
  return {
    month: value,
    scope: "global-runner",
    timezone: "UTC",
    daily_run_cap: 25,
    daily_agent_minutes_cap: 180,
    per_issue_retry_cap: 3,
    rate_limit_backoff_minutes: 30,
    runs: [],
    rate_limits: []
  };
}

function normalizeBudget(value, budget) {
  const defaults = defaultBudget(value);
  if (!budget || typeof budget !== "object") return defaults;
  return {
    ...defaults,
    ...budget,
    month: budget.month || defaults.month,
    runs: Array.isArray(budget.runs) ? budget.runs : [],
    rate_limits: Array.isArray(budget.rate_limits) ? budget.rate_limits : []
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      out[arg.slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    }
  }
  return out;
}
