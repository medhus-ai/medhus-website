#!/usr/bin/env node
const { existsSync, readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const args = parseArgs(process.argv.slice(2));
const configPath = path.join(process.cwd(), ".agents", "memory", "ai-runners.json");

if (!existsSync(configPath)) {
  console.error("AI runner config missing: " + configPath);
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const runners = new Map((config.runners || []).map((runner) => [runner.id, runner]));

if (args.health) {
  const targets = args.all ? [...runners.keys()] : [requireRunnerId(args)];
  for (const id of targets) {
    runHealthcheck(getRunner(id));
  }
  console.log(`AI runner health ok: ${targets.join(", ")}`);
  process.exit(0);
}

const runner = getRunner(requireRunnerId(args));
const prompt = args["prompt-file"]
  ? readFileSync(args["prompt-file"], "utf8")
  : String(args.prompt || "");

if (!prompt.trim()) {
  console.error("--prompt-file or --prompt is required");
  process.exit(2);
}

runInvocation(runner, prompt);

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
  const runner = runners.get(id);
  if (!runner) {
    console.error(`unknown AI runner: ${id}`);
    process.exit(2);
  }
  return runner;
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
