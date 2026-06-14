#!/usr/bin/env node
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const args = parseArgs(process.argv.slice(2));
const projectConfigPath = path.join(process.cwd(), ".agents", "memory", "ai-runners.json");
const globalConfigPath = process.env.GITCREW_RUNNERS_FILE
  ? path.resolve(process.env.GITCREW_RUNNERS_FILE)
  : path.join(os.homedir(), ".gitcrew", "ai-runners.json");

if (!existsSync(projectConfigPath)) {
  console.error("AI runner mapping missing: " + projectConfigPath);
  process.exit(1);
}

const projectConfig = readJson(projectConfigPath);
const globalConfig = existsSync(globalConfigPath) ? readJson(globalConfigPath) : {};
const projectRunners = Array.isArray(projectConfig.runners) ? projectConfig.runners : [];
const globalRunners = Array.isArray(globalConfig.runners) ? globalConfig.runners : [];
const effectiveRunners = globalRunners.length ? globalRunners : projectRunners;
const defaults = projectConfig.default_role_runners || globalConfig.default_role_runners || {};
const runners = new Map(effectiveRunners.map((runner) => [runner.id, runner]));

if (args.health) {
  const targets = args.all ? [...runners.keys()] : [requireRunnerId(args)];
  for (const id of targets) {
    runHealthcheck(getRunner(id));
  }
  console.log(`AI runner health ok: ${targets.join(", ")}`);
} else {
  const task = args["prompt-file"]
    ? readFileSync(args["prompt-file"], "utf8")
    : String(args.prompt || "");

  if (!task.trim()) {
    console.error("--prompt-file or --prompt is required");
    process.exit(2);
  }

  // With --role, prepend the same Role / Conventions / Project scope preamble
  // the cockpit inlines, so a CI agent always gets that context inline rather
  // than being asked to go read the files. Without --role, the prompt is sent
  // verbatim (callers that build their own full prompt, e.g. plan-review).
  const prompt = args.role ? withContextPreamble(String(args.role), task) : task;

  if (args["print-prompt"]) {
    writeFileSync(1, prompt);
  } else {
    runInvocation(getRunner(requireRunnerId(args)), prompt);
  }
}

function withContextPreamble(role, task) {
  const readMaybe = (file, missing) => {
    try { return readFileSync(file, "utf8").trim(); } catch { return missing; }
  };
  return [
    `You are the ${role} for this project. Follow the role file below exactly.`,
    "",
    "## Role",
    readMaybe(path.join(".agents", "roles", `${role}.md`), "(role file missing)"),
    "",
    "## Coding conventions",
    readMaybe(path.join(".agents", "memory", "conventions.md"), "(conventions missing)"),
    "",
    "## Project scope",
    readMaybe(path.join(".agents", "memory", "project-scope.md"), "(scope missing)"),
    "",
    "## Your task",
    task.trim()
  ].join("\n");
}

function runInvocation(runner, prompt) {
  const command = runner.command;
  const commandArgs = (runner.args || []).map((value) => value === "{prompt}" ? prompt : String(value));
  if (!command) {
    console.error(`runner ${runner.id} has no command`);
    process.exit(2);
  }
  const status = runner.uses_doppler
    ? spawnSync(".github/scripts/doppler-run.sh", ["--", command, ...commandArgs], { stdio: "inherit" }).status
    : spawnSync(command, commandArgs, { stdio: "inherit" }).status;
  process.exit(status ?? 1);
}

function runHealthcheck(runner) {
  const health = runner.healthcheck;
  if (!health) {
    console.log(`AI runner ${runner.id}: no healthcheck configured; skipped`);
    return;
  }
  const command = health.command || runner.command;
  const commandArgs = health.args || runner.args || [];
  const result = runner.uses_doppler
    ? spawnSync(".github/scripts/doppler-run.sh", ["--", command, ...commandArgs], { encoding: "utf8" })
    : spawnSync(command, commandArgs, { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`AI runner health failed: ${runner.id}`);
    process.exit(1);
  }
  if (health.expect_stdout && String(result.stdout || "").trim() !== health.expect_stdout) {
    console.error(`AI runner health returned unexpected output: ${runner.id}`);
    process.exit(1);
  }
}

function getRunner(id) {
  const resolvedId = resolveRunnerId(id);
  const runner = runners.get(resolvedId);
  if (!runner) {
    const mapped = resolvedId !== id ? ` (mapped to ${resolvedId})` : "";
    const known = [...runners.keys()].join(", ") || "(none)";
    console.error(`unknown AI runner: ${id}${mapped}. configured runners: ${known}`);
    process.exit(2);
  }
  return runner;
}

function resolveRunnerId(id) {
  const configured = resolveConfiguredRunnerId(id);
  if (configured) return configured;
  const frontmatterRunner = readRoleRunnerId(id);
  if (frontmatterRunner && frontmatterRunner !== "default") {
    return resolveConfiguredRunnerId(frontmatterRunner) || frontmatterRunner;
  }
  return id;
}

function resolveConfiguredRunnerId(id) {
  let current = String(id || "");
  const seen = new Set();
  while (current && !seen.has(current)) {
    if (runners.has(current)) return current;
    seen.add(current);
    current = defaults[current] ? String(defaults[current]) : "";
  }
  return "";
}

function readRoleRunnerId(role) {
  try {
    const text = readFileSync(path.join(".agents", "roles", `${role}.md`), "utf8");
    const match = text.match(/^runner_id:\s*(\S+)/m);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function requireRunnerId(values) {
  if (!values.runner) {
    console.error("--runner is required");
    process.exit(2);
  }
  return String(values.runner);
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

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error("AI runner config cannot be read: " + file + ": " + error.message);
    process.exit(1);
  }
}
