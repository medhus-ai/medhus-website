#!/usr/bin/env node
const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ALWAYS_PRESENT = new Set(["triager", "coordinator", "planner", "code-reviewer", "qa-engineer", "engineer"]);
const PLAN_FILES = ["overview.md", "decisions.md", "architecture.md", "tasks.md", "tests.md", "risks.md"];

const args = parseArgs(process.argv.slice(2));
const issue = args.issue;
if (!issue) usage("--issue <id> is required");

const planDir = path.join(".agents/plans", String(issue));
if (!existsPath(planDir)) usage(`plan dir ${planDir} not found`);

const specialists = listSpecialists();
if (specialists.length === 0) {
  postComment(issue, "Plan review: no specialists installed; transitioning to human review.");
  transitionLabel(issue, "plan-files-committed", "plan-human-review");
  transitionLabel(issue, "plan-needs-revision", "plan-human-review");
  process.exit(0);
}

const rubric = parseRubric(".agents/plan-rubric.md");
const planContext = buildPlanContext(planDir);
const passNumber = countPriorPasses(issue) + 1;

const scorecards = [];
for (const role of specialists) {
  const result = runSpecialist(role, planContext, rubric);
  postComment(issue, result.output);
  scorecards.push({ role, scores: parseScores(result.output, rubric.metricIds) });
}

const verdict = computeGate(scorecards, rubric);
const summary = buildAggregateComment(scorecards, rubric, verdict, passNumber);
postComment(issue, summary);

if (verdict.pass) {
  transitionLabel(issue, "plan-files-committed", "plan-human-review");
  transitionLabel(issue, "plan-needs-revision", "plan-human-review");
} else if (passNumber < 2) {
  transitionLabel(issue, "plan-files-committed", "plan-needs-revision");
} else {
  transitionLabel(issue, "plan-needs-revision", "plan-human-review");
  transitionLabel(issue, "plan-files-committed", "plan-human-review");
}

function listSpecialists() {
  let entries;
  try { entries = readdirSync(".agents/roles"); } catch { return []; }
  return entries
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((f) => f.slice(0, -3))
    .filter((name) => !ALWAYS_PRESENT.has(name))
    .sort();
}

function parseRubric(rubricPath) {
  const defaults = { metrics: [{ id: "clarity", threshold: 7 }, { id: "assumptions_surfaced", threshold: 7 }, { id: "simplicity", threshold: 7 }, { id: "scope_discipline", threshold: 7 }, { id: "verifiability", threshold: 7 }, { id: "code_rule_fit", threshold: 7 }] };
  let text;
  try { text = readFileSync(rubricPath, "utf8"); } catch { return { ...defaults, metricIds: defaults.metrics.map((m) => m.id) }; }
  const metrics = [];
  const re = /- id: (\S+)[\s\S]*?threshold: (\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    metrics.push({ id: m[1], threshold: Number(m[2]) });
  }
  const finalMetrics = metrics.length > 0 ? metrics : defaults.metrics;
  return { metrics: finalMetrics, metricIds: finalMetrics.map((m) => m.id) };
}

function buildPlanContext(planDir) {
  const parts = [];
  for (const name of PLAN_FILES) {
    const full = path.join(planDir, name);
    let body = "(missing)";
    try { body = readFileSync(full, "utf8"); } catch {}
    parts.push(`### ${name}\n\n${body}`);
  }
  return parts.join("\n\n");
}

function runSpecialist(role, planContext, rubric) {
  const rolePrompt = readMaybe(`.agents/roles/${role}.md`) || "(role file missing)";
  const conventions = readMaybe(".agents/memory/conventions.md") || "(conventions missing)";
  const rubricBody = readMaybe(".agents/plan-rubric.md") || "(rubric missing)";
  const promptBody = [
    `You are the ${role}. Read your role file, then rate the plan below on every metric in the rubric.`,
    "",
    "## Role", rolePrompt,
    "",
    "## Conventions", conventions,
    "",
    "## Rubric", rubricBody,
    "",
    "## Plan", planContext,
    "",
    "## Your task",
    "Post one scorecard in the format defined in plan-rubric.md (### Plan scorecard \u2014 <role>, table of Metric/Score/Justification, then P0 blockers / Required changes / Optional notes).",
    "Do NOT call gh yourself; just print the scorecard markdown to stdout."
  ].join("\n");
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "plan-review-"));
  const promptFile = path.join(tmpDir, `prompt-${role}.txt`);
  writeFileSync(promptFile, promptBody, "utf8");
  const runner = inferRunner(role);
  const result = spawnSync("bash", [".github/scripts/ai-run.sh", "--runner", runner, "--prompt-file", promptFile], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    return { role, output: `### Plan scorecard \u2014 ${role}\n\nRunner failed (exit ${result.status}). stderr:\n\n${result.stderr || "(none)"}` };
  }
  return { role, output: result.stdout?.trim() || `### Plan scorecard \u2014 ${role}\n\n(no output)` };
}

function inferRunner(role) {
  // Read role frontmatter to find runner_id; default specialists use the engineer lane.
  const text = readMaybe(`.agents/roles/${role}.md`) || "";
  const m = text.match(/^runner_id:\s*(\S+)/m);
  const explicit = m ? m[1] : "";
  return explicit && explicit !== "default" ? explicit : "engineer";
}

function parseScores(scorecard, metricIds) {
  const scores = {};
  const re = /^\|\s*([A-Za-z][A-Za-z0-9_-]*)\s*\|\s*(\d{1,2})\s*\|/gm;
  let m;
  while ((m = re.exec(scorecard)) !== null) {
    if (metricIds.includes(m[1])) {
      scores[m[1]] = Number(m[2]);
    }
  }
  return scores;
}

function computeGate(scorecards, rubric) {
  // Pass = every metric has at least one specialist scoring at or above its threshold,
  // AND no scorecard contains "P0 blockers: <something non-empty>" (a loose check).
  const minByMetric = {};
  for (const card of scorecards) {
    for (const [id, score] of Object.entries(card.scores)) {
      if (minByMetric[id] === undefined || score < minByMetric[id]) {
        minByMetric[id] = score;
      }
    }
  }
  const failing = [];
  for (const metric of rubric.metrics) {
    const min = minByMetric[metric.id];
    if (min === undefined || min < metric.threshold) {
      failing.push({ id: metric.id, threshold: metric.threshold, lowest: min });
    }
  }
  return { pass: failing.length === 0, failing, minByMetric };
}

function buildAggregateComment(scorecards, rubric, verdict, passNumber) {
  const lines = [];
  lines.push(`### Plan review aggregate (pass ${passNumber})`);
  lines.push("");
  lines.push("| Metric | Lowest score | Threshold | Verdict |");
  lines.push("|---|---|---|---|");
  for (const metric of rubric.metrics) {
    const low = verdict.minByMetric[metric.id];
    const status = low === undefined ? "missing" : low < metric.threshold ? `fail (${low})` : `pass (${low})`;
    lines.push(`| ${metric.id} | ${low === undefined ? "-" : low} | ${metric.threshold} | ${status} |`);
  }
  lines.push("");
  lines.push(`**Specialists rated:** ${scorecards.map((c) => c.role).join(", ") || "(none)"}`);
  if (verdict.pass) {
    lines.push("**Gate:** pass. Transitioning to plan-human-review.");
  } else if (passNumber < 2) {
    lines.push("**Gate:** fail on pass 1. Transitioning to plan-needs-revision (planner gets ONE revision).");
  } else {
    lines.push("**Gate:** still failing on pass 2. Transitioning to plan-human-review regardless (one-revision rule).");
  }
  return lines.join("\n");
}

function countPriorPasses(issue) {
  try {
    const out = execFileSync("gh", ["issue", "view", String(issue), "--json", "comments"], { encoding: "utf8" });
    const data = JSON.parse(out);
    return (data.comments || []).filter((c) => /### Plan review aggregate \(pass \d+\)/.test(c.body || "")).length;
  } catch { return 0; }
}

function postComment(issue, body) {
  spawnSync("gh", ["issue", "comment", String(issue), "--body", body], { encoding: "utf8", env: process.env });
}

function transitionLabel(issue, removeLabel, addLabel) {
  spawnSync("gh", ["issue", "edit", String(issue), "--remove-label", removeLabel, "--add-label", addLabel], { encoding: "utf8", env: process.env });
}

function readMaybe(file) {
  try { return readFileSync(file, "utf8"); } catch { return null; }
}

function existsPath(p) {
  try { require("node:fs").statSync(p); return true; } catch { return false; }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

function usage(msg) {
  console.error(`plan-review-runner.js: ${msg}`);
  console.error("usage: plan-review-runner.js --issue <id>");
  process.exit(2);
}
