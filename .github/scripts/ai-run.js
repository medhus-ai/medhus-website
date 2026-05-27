#!/usr/bin/env node
const { existsSync, readFileSync } = require("node:fs");
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
  const runner = getRunner(requireRunnerId(args));
  const prompt = args["prompt-file"]
    ? readFileSync(args["prompt-file"], "utf8")
    : String(args.prompt || "");

  if (!prompt.trim()) {
    console.error("--prompt-file or --prompt is required");
    process.exit(2);
  }

  runInvocation(runner, prompt);
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
  if (runners.has(id)) return id;
  if (defaults[id]) return String(defaults[id]);
  return id;
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
