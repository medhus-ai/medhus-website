#!/usr/bin/env node
const { readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");

const args = parseArgs(process.argv.slice(2));
const activeLabels = String(args["active-labels"] || "triage-needed,needs-design,design-ready,ready-for-impl,in-progress,ready-for-review,human-review-needed,blocked,rate-limited,cost-cap-hit,done").split(",");
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

for (const pause of ["blocked", "human-review-needed", "cost-cap-hit"]) {
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
  const json = execFileSync("gh", [kind, "view", String(target), "--json", "labels"], { encoding: "utf8" });
  const parsed = JSON.parse(json);
  return (parsed.labels || []).map((label) => label.name);
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
    execFileSync("gh", [kind, "comment", String(target), "--body", `State guard failed: ${message}`], { stdio: "ignore" });
    if (invariant) {
      execFileSync("gh", [kind, "edit", String(target), "--add-label", "human-review-needed"], { stdio: "ignore" });
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
