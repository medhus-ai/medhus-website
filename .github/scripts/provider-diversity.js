#!/usr/bin/env node
// Advisory check (never blocks): a second model should verify the first
// (Karpathy's verifier layer). Warns when the builder lane (engineer) and the
// verifier lane (code-reviewer/qa-engineer) run on the same provider. The
// crew-manager quotes the recommendation in its digest; CI never gates on it.
const { readFileSync, existsSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BUILT_IN_PROVIDERS = {
  "claude-agent-sonnet-medium": "anthropic",
  "claude-agent-sonnet-high": "anthropic",
  "claude-agent-sonnet-very-high": "anthropic",
  "claude-agent-opus-high": "anthropic",
  "claude-agent-opus-max": "anthropic",
  "codex-agent-medium": "openai",
  "codex-agent-high": "openai",
  "codex-agent-very-high": "openai"
};

const args = parseArgs(process.argv.slice(2));
const result = assess();

if (args.json) {
  writeFileSync(1, `${JSON.stringify(result, null, 2)}\n`);
} else {
  writeFileSync(1, `${result.message}\n`);
}

function assess() {
  const defaults = readProjectRoleRunners();
  const providers = readGlobalProviders();
  const providerOf = (role) => providers.get(String(defaults[role] || "")) || null;
  const builder = providerOf("engineer");
  const verifier = providerOf("code-reviewer") || providerOf("qa-engineer");

  if (!builder || !verifier) {
    return { level: "unknown", builder, verifier, message: "provider diversity: engineer and code-reviewer are not both mapped to configured runners yet." };
  }
  if (builder !== verifier) {
    return { level: "ok", builder, verifier, message: `provider diversity: OK — ${label(builder)} builds and ${label(verifier)} verifies.` };
  }
  return {
    level: "warn",
    builder,
    verifier,
    message: `provider diversity: RECOMMENDED — engineer and code-reviewer both run on ${label(builder)}. Assign the code-reviewer (or qa-engineer) a second provider so a different model verifies the builder's work. Not required.`
  };
}

function readProjectRoleRunners() {
  const file = path.join(process.cwd(), ".agents/memory/ai-runners.json");
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, "utf8")).default_role_runners || {}; } catch { return {}; }
}

function readGlobalProviders() {
  const file = process.env.GITCREW_RUNNERS_FILE
    ? path.resolve(process.env.GITCREW_RUNNERS_FILE)
    : path.join(os.homedir(), ".gitcrew", "ai-runners.json");
  const map = new Map(Object.entries(BUILT_IN_PROVIDERS));
  if (!existsSync(file)) return map;
  try {
    for (const runner of JSON.parse(readFileSync(file, "utf8")).runners || []) {
      if (runner && runner.id) map.set(String(runner.id), runner.provider || null);
    }
  } catch { /* unreadable registry → treated as unconfigured */ }
  return map;
}

function label(provider) {
  return ({ anthropic: "Claude", openai: "Codex" })[provider] || provider;
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (arg === "--json") out.json = true;
  }
  return out;
}
