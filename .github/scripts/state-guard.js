#!/usr/bin/env node
const { readFileSync } = require("node:fs");
const { execFileSync, spawnSync } = require("node:child_process");

const args = parseArgs(process.argv.slice(2));
const activeLabels = String(args["active-labels"] || "needs-tag,triage-running,out-of-scope-recommended,needs-scope-decision,ready-to-plan,plan-drafting,plan-needs-clarify,plan-files-committed,plan-review-running,plan-needs-revision,plan-user-review,plan-approved,building,build-coordinating,code-review-requested,code-review-passed,human-test,user-review-needed,blocked,rate-limited,cost-cap-hit,done").split(",");
const target = args.issue || args.pr;

if (!target || !args["expect-label"] || !args.actor || !args.allowlist) {
  failLocal("usage: state-guard.sh --issue N|--pr N --expect-label LABEL --actor LOGIN --allowlist PATH");
}

const labels = fetchLabels();
const allowed = readAllowlist(args.allowlist);
const actorTrusted = allowed.has(args.actor) || (args.pr && labels.includes("trusted-for-agent-review"));

if (!actorTrusted) {
  failRemote("actor is not trusted for automation", false);
}

const active = labels.filter((label) => activeLabels.includes(label));
if (active.length !== 1) {
  failRemote(`expected exactly one active state label, found: ${active.join(", ") || "none"}`, true);
}

if (!labels.includes(args["expect-label"])) {
  failRemote(`expected trigger label missing: ${args["expect-label"]}`, false);
}

for (const pause of ["blocked", "user-review-needed", "cost-cap-hit"]) {
  if (labels.includes(pause) && pause !== args["expect-label"]) {
    failRemote(`pause label present: ${pause}`, false);
  }
}

if (args["domain-label"] && !labels.includes(args["domain-label"])) {
  failRemote(`required domain label missing: ${args["domain-label"]}`, false);
}

if (labels.includes("retry-3")) {
  failRemote("retry cap reached", false);
}

console.log("state guard ok");

function fetchLabels() {
  const kind = args.issue ? "issue" : "pr";
  const result = spawnSync("gh", [kind, "view", String(target), "--json", "labels"], {
    encoding: "utf8",
    env: process.env
  });
  if (result.status === 0) {
    const parsed = JSON.parse(result.stdout);
    return (parsed.labels || []).map((label) => label.name);
  }
  if (canUseApi()) {
    const out = execFileSync(process.execPath, [
      ".github/scripts/github-api.js",
      "labels",
      args.issue ? "--issue" : "--pr",
      String(target)
    ], { encoding: "utf8", env: process.env });
    return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  if (result.error) throw result.error;
  throw new Error(result.stderr?.trim() || "gh label lookup failed");
}

function readAllowlist(file) {
  return new Set(readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")));
}

function failRemote(message, invariant) {
  const kind = args.issue ? "issue" : "pr";
  try {
    githubComment(kind, target, `State guard failed: ${message}`);
    if (invariant) {
      githubLabel(kind, target, ["user-review-needed"], []);
    }
  } catch {
    // Surface original guard failure.
  }
  failLocal(message);
}

function failLocal(message) {
  console.error(message);
  process.exit(1);
}

function githubComment(kind, number, body) {
  const result = spawnSync("gh", [kind, "comment", String(number), "--body", body], { stdio: "ignore", env: process.env });
  if (result.status === 0) return;
  if (canUseApi()) {
    execFileSync(process.execPath, [
      ".github/scripts/github-api.js",
      "comment",
      kind === "issue" ? "--issue" : "--pr",
      String(number),
      "--body",
      body
    ], { stdio: "ignore", env: process.env });
  }
}

function githubLabel(kind, number, add, remove) {
  const ghArgs = [kind, "edit", String(number)];
  for (const label of add) ghArgs.push("--add-label", label);
  for (const label of remove) ghArgs.push("--remove-label", label);
  const result = spawnSync("gh", ghArgs, { stdio: "ignore", env: process.env });
  if (result.status === 0) return;
  if (canUseApi()) {
    const apiArgs = [".github/scripts/github-api.js", "label-edit", kind === "issue" ? "--issue" : "--pr", String(number)];
    for (const label of add) apiArgs.push("--add-label", label);
    for (const label of remove) apiArgs.push("--remove-label", label);
    execFileSync(process.execPath, apiArgs, { stdio: "ignore", env: process.env });
  }
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
