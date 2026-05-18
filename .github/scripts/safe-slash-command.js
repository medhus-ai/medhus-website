#!/usr/bin/env node
const { readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");

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
const ACTIVE_LABELS = new Set(["triage-needed", "needs-design", "design-ready", "ready-for-impl", "in-progress", "ready-for-review", "human-review-needed", "blocked", "rate-limited", "cost-cap-hit", "done"]);
const allowlistPath = process.env.ENGINEERING_AUTOMATION_ALLOWLIST || ".github/slash-allowlist.txt";

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
    guard(issueNumber, "design-ready");
    gh("issue", "edit", issueNumber, "--remove-label", "design-ready", "--add-label", "ready-for-impl");
    break;
  case "/retry":
    retry(issueNumber);
    break;
  case "/test":
  case "/retest":
    dispatchWorkflow(process.env.ENGINEERING_AUTOMATION_TEST_WORKFLOW || "test.yml", issueNumber);
    break;
  case "/escalate":
    gh("issue", "edit", issueNumber, "--add-label", "human-review-needed");
    break;
  case "/cancel":
    gh("issue", "edit", issueNumber, "--remove-label", "in-progress", "--add-label", "blocked");
    break;
  case "/cost":
    execFileSync("node", [".github/scripts/budget-by-issue.js", String(issueNumber)], { stdio: "inherit" });
    break;
}

function retry(number) {
  const labels = JSON.parse(execFileSync("gh", ["issue", "view", String(number), "--json", "labels"], { encoding: "utf8" })).labels.map((label) => label.name);
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
  const workflow = process.env.ENGINEERING_AUTOMATION_RETRY_WORKFLOW;
  if (workflow) {
    dispatchWorkflow(workflow, number);
  } else {
    gh("issue", "comment", number, "--body", `Retry metadata added (${next}). Set ENGINEERING_AUTOMATION_RETRY_WORKFLOW to dispatch automatically.`);
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
  execFileSync("gh", args.map(String), { stdio: "inherit" });
}
