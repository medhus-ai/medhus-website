#!/usr/bin/env node
const { readFileSync, existsSync } = require("node:fs");
const { execFileSync, spawnSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const target = process.argv[2];
if (!target) {
  console.error("usage: budget-by-issue.js <issue-or-pr-number>");
  process.exit(2);
}

const month = new Date().toISOString().slice(0, 7);
const budgetPath = resolveBudgetPath(month);
if (!existsSync(budgetPath)) {
  console.error("budget file missing: " + budgetPath);
  process.exit(1);
}

const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
const runs = (budget.runs || []).filter((run) => {
  const value = String(run.issue_or_pr || "");
  return value === String(target) || value === `issue-${target}` || value === `PR-${target}`;
});
const seconds = runs.reduce((sum, run) => sum + Number(run.duration_seconds || 0), 0);
const retries = runs.reduce((max, run) => Math.max(max, Number(run.retry_count_after_run || 0)), 0);
const cost = runs
  .map((run) => run.provider_reported_cost_usd)
  .filter((value) => typeof value === "number")
  .reduce((sum, value) => sum + value, 0);

const body = [
  "Budget summary:",
  `- Runs: ${runs.length}`,
  `- Agent minutes: ${Math.round(seconds / 60)}`,
  `- Retry count: ${retries}`,
  `- Provider-reconciled cost: ${cost ? "$" + cost.toFixed(4) : "not configured"}`
].join("\n");

if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
  try {
    const result = spawnSync("gh", ["issue", "comment", String(target), "--body", body], { stdio: "ignore", env: process.env });
    if (result.status !== 0) {
      execFileSync(process.execPath, [".github/scripts/github-api.js", "comment", "--issue", String(target), "--body", body], { stdio: "ignore", env: process.env });
    }
  } catch {
    console.log(body);
  }
} else {
  console.log(body);
}

function resolveBudgetPath(value) {
  const globalDir = process.env.GITCREW_BUDGET_DIR
    ? path.resolve(process.env.GITCREW_BUDGET_DIR)
    : path.join(os.homedir(), ".gitcrew", "budget");
  return path.join(globalDir, `${value}.json`);
}
