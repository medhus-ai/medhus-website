#!/usr/bin/env node
const { mkdirSync, readFileSync, writeFileSync, existsSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const args = parseArgs(process.argv.slice(2));
const now = new Date();
const month = now.toISOString().slice(0, 7);
const today = now.toISOString().slice(0, 10);
const budgetPath = resolveBudgetPath(month, { create: true });
const budget = readBudget(month, budgetPath);
const runsToday = (budget.runs || []).filter((run) => String(run.timestamp || "").startsWith(today));
const secondsToday = runsToday.reduce((sum, run) => sum + Number(run.duration_seconds || 0), 0);
const retryCount = retryCountForTarget(budget, args.issue || args.pr);

if (runsToday.length >= Number(budget.daily_run_cap || 0)) {
  fail("daily run cap reached");
}
if (secondsToday >= Number(budget.daily_agent_minutes_cap || 0) * 60) {
  fail("daily agent-minute cap reached");
}
if (retryCount >= Number(budget.per_issue_retry_cap || 3)) {
  fail("retry cap reached");
}

console.log("budget ok");

function readBudget(value, file) {
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(defaultBudget(value), null, 2)}\n`, "utf8");
  }
  return JSON.parse(readFileSync(file, "utf8"));
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

function retryCountForTarget(budget, target) {
  if (!target) return 0;
  const key = args.issue ? `issue-${target}` : `PR-${target}`;
  return (budget.runs || [])
    .filter((run) => String(run.issue_or_pr) === key || String(run.issue_or_pr) === String(target))
    .reduce((max, run) => Math.max(max, Number(run.retry_count_after_run || 0)), 0);
}

function fail(message) {
  const target = args.issue || args.pr;
  if (target && process.env.GH_TOKEN) {
    const kind = args.issue ? "issue" : "pr";
    safeGh(kind, "comment", target, "--body", `Budget check failed: ${message}`);
    safeGh(kind, "edit", target, "--add-label", "cost-cap-hit", "--add-label", "human-review-needed");
  }
  console.error(message);
  process.exit(1);
}

function safeGh(...ghArgs) {
  try {
    execFileSync("gh", ghArgs, { stdio: "ignore" });
  } catch {
    // Never hide the original budget failure behind a GitHub update failure.
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      out[arg.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    }
  }
  return out;
}
