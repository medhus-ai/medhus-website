#!/usr/bin/env node
const { execFileSync, spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");

// Cross-PR crew-manager build pass. On every invocation for an issue it:
//   1. parses .agents/plans/<issue>/tasks.md
//   2. classifies tasks via task:<id> labels on PRs (merged = done, open = in-flight)
//   3. dispatches ready + undispatched tasks to engineer.yml
//   4. flags file conflicts between open task PRs with file-conflict-pending
//   5. transitions the issue to human-test once every task PR is merged

const args = parseArgs(process.argv.slice(2));
const issue = args.issue;
if (!issue) usage("--issue <id> is required");

const tasksPath = path.join(".agents/plans", String(issue), "tasks.md");
let tasks;
try { tasks = parseTasks(readFileSync(tasksPath, "utf8")); }
catch (e) { usage(`cannot read ${tasksPath}: ${e.message}`); }
if (tasks.length === 0) usage(`no tasks in ${tasksPath}`);

const prs = listIssueTaskPRs(issue);
const doneIds = new Set(prs.filter((p) => p.state === "MERGED").flatMap((p) => p.taskIds));
const openPRsByTask = new Map();
for (const p of prs) {
  if (p.state === "OPEN") for (const tid of p.taskIds) openPRsByTask.set(tid, p);
}

const ready = tasks.filter((t) => !doneIds.has(t.id) && (t.depends_on || []).every((d) => doneIds.has(d)));
const dispatchable = ready.filter((t) => !openPRsByTask.has(t.id));

for (const t of dispatchable) {
  dispatchEngineer(issue, t.id, t.engineer || "engineer");
  comment(issue, `Crew Manager build: dispatched task ${t.id} to ${t.engineer || "engineer"}.`);
}

flagOpenPRConflicts(tasks, openPRsByTask, issue);

const allDone = tasks.every((t) => doneIds.has(t.id));
if (allDone) {
  transition(issue, "build-coordinating", "human-test");
  transition(issue, "building", "human-test");
  comment(issue, "Crew Manager build: all task PRs merged. Moving to human-test.");
} else if (dispatchable.length === 0 && openPRsByTask.size === 0) {
  comment(issue, "Crew Manager build: no tasks ready to dispatch and none in flight. Check dependency graph.");
}

function flagOpenPRConflicts(tasks, openPRsByTask, issue) {
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  const open = [...openPRsByTask.entries()];
  const flagged = new Set();
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const [tidA, prA] = open[i];
      const [tidB, prB] = open[j];
      if (prA.number === prB.number) continue;
      const filesA = new Set((prA.files || []).concat(declaredFiles(byTask.get(tidA))));
      const shared = (prB.files || []).concat(declaredFiles(byTask.get(tidB))).filter((f) => filesA.has(f));
      if (shared.length > 0) {
        for (const pr of [prA, prB]) {
          if (!flagged.has(pr.number)) {
            githubLabel("pr", pr.number, ["file-conflict-pending"], []);
            flagged.add(pr.number);
          }
        }
        comment(issue, `Crew Manager build: PRs #${prA.number} and #${prB.number} touch overlapping files (${shared.join(", ")}). Merge one before the other.`);
      }
    }
  }
}

function declaredFiles(task) {
  if (!task) return [];
  return (task.files_likely_touched || []).filter((f) => f && !f.includes("*") && !f.includes("<"));
}

function listIssueTaskPRs(issue) {
  try {
    const data = listPullRequests();
    return data
      .map((p) => ({
        number: p.number,
        state: p.state,
        files: (p.files || []).map((f) => f.path),
        taskIds: (p.labels || []).map((l) => l.name).filter((n) => n.startsWith("task:")).map((n) => n.slice(5)),
        issueIds: (p.labels || []).map((l) => l.name).filter((n) => n.startsWith("issue:")).map((n) => n.slice(6))
      }))
      .filter((p) => p.issueIds.includes(String(issue)));
  } catch {
    return [];
  }
}

function listPullRequests() {
  const gh = spawnSync("gh", ["pr", "list", "--state", "all", "--json", "number,state,labels,files", "--limit", "200"], {
    encoding: "utf8",
    env: process.env
  });
  if (gh.status === 0) return JSON.parse(gh.stdout);
  if (canUseApi()) {
    const out = execFileSync(process.execPath, [".github/scripts/github-api.js", "pr-list", "--state", "all", "--limit", "200"], {
      encoding: "utf8",
      env: process.env
    });
    return JSON.parse(out);
  }
  if (gh.error) throw gh.error;
  throw new Error(gh.stderr?.trim() || "gh pr list failed");
}

function dispatchEngineer(issue, taskId, engineer) {
  githubWorkflowRun("engineer.yml", [`issue=${issue}`, `task=${taskId}`, `engineer=${engineer}`]);
}

function comment(issue, body) {
  githubComment("issue", issue, body);
}

function transition(issue, removeLabel, addLabel) {
  githubLabel("issue", issue, [addLabel], [removeLabel]);
}

function githubWorkflowRun(workflow, fields) {
  const ghArgs = ["workflow", "run", workflow];
  for (const field of fields) ghArgs.push("-f", field);
  const gh = spawnSync("gh", ghArgs, { encoding: "utf8", env: process.env });
  if (gh.status === 0 || !canUseApi()) return gh;
  const apiArgs = [".github/scripts/github-api.js", "workflow-run", "--workflow", workflow];
  for (const field of fields) apiArgs.push("--f", field);
  return spawnSync(process.execPath, apiArgs, { encoding: "utf8", env: process.env });
}

function githubComment(kind, number, body) {
  const gh = spawnSync("gh", [kind, "comment", String(number), "--body", body], { encoding: "utf8", env: process.env });
  if (gh.status === 0 || !canUseApi()) return gh;
  const apiArgs = [".github/scripts/github-api.js", "comment", `--${kind}`, String(number), "--body", body];
  return spawnSync(process.execPath, apiArgs, { encoding: "utf8", env: process.env });
}

function githubLabel(kind, number, addLabels, removeLabels) {
  const ghArgs = [kind, "edit", String(number)];
  for (const label of removeLabels.filter(Boolean)) ghArgs.push("--remove-label", label);
  for (const label of addLabels.filter(Boolean)) ghArgs.push("--add-label", label);
  const gh = spawnSync("gh", ghArgs, { encoding: "utf8", env: process.env });
  if (gh.status === 0 || !canUseApi()) return gh;
  const apiArgs = [".github/scripts/github-api.js", "label-edit", `--${kind}`, String(number)];
  for (const label of removeLabels.filter(Boolean)) apiArgs.push("--remove-label", label);
  for (const label of addLabels.filter(Boolean)) apiArgs.push("--add-label", label);
  return spawnSync(process.execPath, apiArgs, { encoding: "utf8", env: process.env });
}

function canUseApi() {
  return Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
}

function parseTasks(md) {
  const fence = "\`\`\`";
  const start = md.indexOf(fence + "yaml");
  if (start < 0) return [];
  const end = md.indexOf(fence, start + 7);
  if (end < 0) return [];
  const block = md.slice(start + 7, end);
  const out = [];
  let cur = null;
  let listKey = null;
  for (const raw of block.split(/\r?\n/)) {
    const line = stripInlineComment(raw.replace(/\s+$/, ""));
    if (!line.trim()) continue;
    const idm = line.match(/^- id:\s*(.+)$/);
    if (idm) {
      if (cur) out.push(cur);
      cur = { id: idm[1].trim().replace(/^["']|["']$/g, ""), engineer: "engineer", depends_on: [], files_likely_touched: [] };
      listKey = null;
      continue;
    }
    if (!cur) continue;
    const kv = line.match(/^\s+([A-Za-z_]+):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      const val = kv[2].trim();
      if (key === "engineer") { cur.engineer = val.replace(/^["']|["']$/g, "") || "engineer"; listKey = null; }
      else if (key === "depends_on" || key === "files_likely_touched") {
        if (val.startsWith("[")) { cur[key] = val.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean); listKey = null; }
        else { cur[key] = []; listKey = key; }
      } else { listKey = null; }
      continue;
    }
    const it = line.match(/^\s+-\s+(.*)$/);
    if (it && listKey) cur[listKey].push(it[1].trim().replace(/^["']|["']$/g, ""));
  }
  if (cur) out.push(cur);
  return out;
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) o[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return o;
}

function stripInlineComment(line) {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if ((ch === "\"" || ch === "'") && line[i - 1] !== "\\") {
      quote = quote === ch ? "" : quote || ch;
    }
    if (!quote && ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i).replace(/\s+$/, "");
    }
  }
  return line;
}

function usage(msg) {
  console.error(`crew-manager-build.js: ${msg}`);
  console.error("usage: crew-manager-build.js --issue <id>");
  process.exit(2);
}
