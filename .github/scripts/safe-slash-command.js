#!/usr/bin/env node
const { readFileSync } = require("node:fs");
const { execFileSync, spawnSync } = require("node:child_process");

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) {
  console.error("GITHUB_EVENT_PATH is required");
  process.exit(2);
}

const event = JSON.parse(readFileSync(eventPath, "utf8"));
const issueNumber = event.issue?.number;
const actor = event.comment?.user?.login;
const body = String(event.comment?.body || "");
const command = body.trim().split(/\s+/)[0];
const allowed = new Set(["/approve", "/retry", "/test", "/retest", "/escalate", "/cancel", "/cost"]);
const ACTIVE_LABELS = new Set(["needs-tag", "triage-running", "out-of-scope-recommended", "needs-scope-decision", "ready-to-plan", "plan-drafting", "plan-needs-clarify", "plan-files-committed", "plan-review-running", "plan-needs-revision", "plan-user-review", "plan-approved", "building", "build-coordinating", "code-review-requested", "code-review-passed", "human-test", "user-review-needed", "blocked", "rate-limited", "cost-cap-hit", "done"]);
const allowlistPath = process.env.GITCREW_ALLOWLIST || ".github/slash-allowlist.txt";

if (!issueNumber || !actor || !command.startsWith("/")) {
  process.exit(0);
}

if (!readAllowlist(allowlistPath).has(actor)) {
  gh("issue", "comment", issueNumber, "--body", "Slash command refused: actor is not allowlisted.");
  process.exit(0);
}

if (!allowed.has(command)) {
  gh("issue", "comment", issueNumber, "--body", `Unknown command: ${command}`);
  process.exit(0);
}

switch (command) {
  case "/approve":
    guard(issueNumber, "plan-user-review");
    gh("issue", "edit", issueNumber, "--remove-label", "plan-user-review", "--add-label", "plan-approved");
    break;
  case "/retry":
    retry(issueNumber);
    break;
  case "/test":
  case "/retest":
    dispatchWorkflow(process.env.GITCREW_TEST_WORKFLOW || "test.yml", issueNumber);
    break;
  case "/escalate":
    gh("issue", "edit", issueNumber, "--add-label", "user-review-needed");
    break;
  case "/cancel":
    gh("issue", "edit", issueNumber, "--remove-label", "in-progress", "--add-label", "blocked");
    break;
  case "/cost":
    execFileSync("node", [".github/scripts/budget-by-issue.js", String(issueNumber)], { stdio: "inherit" });
    break;
}

function retry(number) {
  const labels = labelsForIssue(number);
  const active = labels.find((label) => ACTIVE_LABELS.has(label));
  if (!active) {
    gh("issue", "comment", number, "--body", "Retry refused: no active state label found.");
    return;
  }
  guard(number, active);
  if (labels.includes("retry-3")) {
    gh("issue", "comment", number, "--body", "Retry refused: retry-3 is already present.");
    return;
  }
  const next = labels.includes("retry-2") ? "retry-3" : labels.includes("retry-1") ? "retry-2" : "retry-1";
  gh("issue", "edit", number, "--add-label", next);
  const workflow = process.env.GITCREW_RETRY_WORKFLOW;
  if (workflow) {
    dispatchWorkflow(workflow, number);
  } else {
    gh("issue", "comment", number, "--body", `Retry metadata added (${next}). Set GITCREW_RETRY_WORKFLOW to dispatch automatically.`);
  }
}

function dispatchWorkflow(workflow, number) {
  gh("workflow", "run", workflow, "-f", `issue=${number}`);
}

function guard(number, expectedLabel) {
  execFileSync(".github/scripts/state-guard.sh", [
    "--issue",
    String(number),
    "--expect-label",
    expectedLabel,
    "--actor",
    actor,
    "--allowlist",
    allowlistPath
  ], { stdio: "inherit" });
}

function readAllowlist(file) {
  return new Set(readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")));
}

function gh(...args) {
  const result = spawnSync("gh", args.map(String), { stdio: "inherit", env: process.env });
  if (result.status === 0) return;
  if (canUseApi() && ghApiFromGhArgs(args)) return;
  if (result.error) throw result.error;
  process.exit(result.status || 1);
}

function labelsForIssue(number) {
  const result = spawnSync("gh", ["issue", "view", String(number), "--json", "labels"], {
    encoding: "utf8",
    env: process.env
  });
  if (result.status === 0) {
    return JSON.parse(result.stdout).labels.map((label) => label.name);
  }
  if (canUseApi()) {
    const out = execFileSync(process.execPath, [".github/scripts/github-api.js", "labels", "--issue", String(number)], {
      encoding: "utf8",
      env: process.env
    });
    return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  if (result.error) throw result.error;
  throw new Error(result.stderr?.trim() || "gh issue view failed");
}

function ghApiFromGhArgs(args) {
  const [scope, action, target, ...rest] = args.map(String);
  if (scope === "issue" && action === "comment") {
    execFileSync(process.execPath, [".github/scripts/github-api.js", "comment", "--issue", target, "--body", valueAfter(rest, "--body")], { stdio: "inherit", env: process.env });
    return true;
  }
  if (scope === "issue" && action === "edit") {
    execFileSync(process.execPath, [".github/scripts/github-api.js", "label-edit", "--issue", target, ...labelArgs(rest)], { stdio: "inherit", env: process.env });
    return true;
  }
  if (scope === "workflow" && action === "run") {
    const fields = [];
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] === "-f") fields.push("--f", rest[++i]);
    }
    execFileSync(process.execPath, [".github/scripts/github-api.js", "workflow-run", "--workflow", target, ...fields], { stdio: "inherit", env: process.env });
    return true;
  }
  return false;
}

function labelArgs(rest) {
  const out = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--add-label") out.push("--add-label", rest[++i]);
    else if (rest[i] === "--remove-label") out.push("--remove-label", rest[++i]);
  }
  return out;
}

function valueAfter(args, key) {
  const idx = args.indexOf(key);
  return idx >= 0 ? String(args[idx + 1] || "") : "";
}

function canUseApi() {
  return Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
}
