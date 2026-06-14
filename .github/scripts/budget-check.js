#!/usr/bin/env node
const { mkdirSync, readFileSync, writeFileSync, existsSync } = require("node:fs");
const { execFileSync, spawnSync } = require("node:child_process");
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

if (runsToday.length >= Number(budget.daily_run_cap)) {
  fail("daily run cap reached");
}
if (secondsToday >= Number(budget.daily_agent_minutes_cap) * 60) {
  fail("daily agent-minute cap reached");
}
if (retryCount >= Number(budget.per_issue_retry_cap)) {
  fail("retry cap reached");
}

console.log("budget ok");

function readBudget(value, file) {
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(defaultBudget(value), null, 2)}\n`, "utf8");
  }
  return normalizeBudget(value, JSON.parse(readFileSync(file, "utf8")));
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

function retryCountForTarget(budget, target) {
  if (!target) return 0;
  const key = args.issue ? `issue-${target}` : `PR-${target}`;
  return (budget.runs || [])
    .filter((run) => String(run.issue_or_pr) === key || String(run.issue_or_pr) === String(target))
    .reduce((max, run) => Math.max(max, Number(run.retry_count_after_run || 0)), 0);
}

function fail(message) {
  const target = args.issue || args.pr;
  if (target && canUseApi()) {
    const kind = args.issue ? "issue" : "pr";
    safeGh(kind, "comment", target, "--body", `Budget check failed: ${message}`);
    safeGh(kind, "edit", target, "--add-label", "cost-cap-hit", "--add-label", "user-review-needed");
  }
  console.error(message);
  process.exit(1);
}

function safeGh(...ghArgs) {
  try {
    const result = spawnSync("gh", ghArgs, { stdio: "ignore", env: process.env });
    if (result.status === 0) return;
    if (canUseApi() && ghApiFromGhArgs(ghArgs)) return;
  } catch {
    // Never hide the original budget failure behind a GitHub update failure.
  }
}

function ghApiFromGhArgs(args) {
  const [scope, action, target, ...rest] = args.map(String);
  if ((scope !== "issue" && scope !== "pr") || !target) return false;
  if (action === "comment") {
    execFileSync(process.execPath, [
      ".github/scripts/github-api.js",
      "comment",
      scope === "issue" ? "--issue" : "--pr",
      target,
      "--body",
      valueAfter(rest, "--body")
    ], { stdio: "ignore", env: process.env });
    return true;
  }
  if (action === "edit") {
    const apiArgs = [".github/scripts/github-api.js", "label-edit", scope === "issue" ? "--issue" : "--pr", target];
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] === "--add-label") apiArgs.push("--add-label", rest[++i]);
      else if (rest[i] === "--remove-label") apiArgs.push("--remove-label", rest[++i]);
    }
    execFileSync(process.execPath, apiArgs, { stdio: "ignore", env: process.env });
    return true;
  }
  return false;
}

function valueAfter(args, key) {
  const idx = args.indexOf(key);
  return idx >= 0 ? String(args[idx + 1] || "") : "";
}

function canUseApi() {
  return Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
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
