#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const GITHUB_API_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;

const args = parseArgs(process.argv.slice(2));

// Run as a CLI; stay importable (no side effects) when required by tests.
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  });
}

async function main() {
  const command = args._[0];
  if (!command) usage("command is required");

  if (command === "labels") {
    const item = await issueLike(args.issue || args.pr);
    writeLines((item.labels || []).map((label) => label.name || label));
    return;
  }

  if (command === "issue-json") {
    const issue = await issueLike(required(args.issue, "--issue is required"));
    console.log(JSON.stringify({
      title: issue.title || "",
      body: issue.body || "",
      labels: issue.labels || [],
      author: issue.user ? { login: issue.user.login } : null,
      createdAt: issue.created_at || ""
    }, null, 2));
    return;
  }

  if (command === "pr-json") {
    const number = required(args.pr, "--pr is required");
    const [pull, issue] = await Promise.all([
      apiJson(`/pulls/${encodeURIComponent(number)}`),
      issueLike(number)
    ]);
    console.log(JSON.stringify({
      title: pull.title || "",
      body: pull.body || "",
      labels: issue.labels || [],
      author: pull.user ? { login: pull.user.login } : null,
      createdAt: pull.created_at || "",
      headRefName: pull.head ? pull.head.ref : "",
      headSha: pull.head ? pull.head.sha : "",
      baseRefName: pull.base ? pull.base.ref : "",
      baseSha: pull.base ? pull.base.sha : ""
    }, null, 2));
    return;
  }

  if (command === "comments") {
    const number = required(args.issue || args.pr, "--issue or --pr is required");
    const comments = await apiJsonAll(`/issues/${encodeURIComponent(number)}/comments?per_page=100`);
    console.log(JSON.stringify({ comments: comments.map((comment) => ({
      body: comment.body || "",
      author: comment.user ? { login: comment.user.login } : null,
      createdAt: comment.created_at || ""
    })) }, null, 2));
    return;
  }

  if (command === "comment") {
    const number = required(args.issue || args.pr, "--issue or --pr is required");
    await apiJson(`/issues/${encodeURIComponent(number)}/comments`, {
      method: "POST",
      body: { body: required(args.body, "--body is required") }
    });
    return;
  }

  if (command === "pr-review") {
    const number = required(args.pr, "--pr is required");
    await apiJson(`/pulls/${encodeURIComponent(number)}/reviews`, {
      method: "POST",
      body: {
        event: String(args.event || "COMMENT").toUpperCase(),
        body: required(args.body, "--body is required")
      }
    });
    return;
  }

  if (command === "check-run") {
    await upsertCheckRun(checkRunBodyFromArgs());
    return;
  }

  if (command === "label-edit") {
    const number = required(args.issue || args.pr, "--issue or --pr is required");
    const add = values(args["add-label"]);
    const remove = values(args["remove-label"]);
    if (add.length) {
      await apiJson(`/issues/${encodeURIComponent(number)}/labels`, {
        method: "POST",
        body: { labels: add }
      });
    }
    for (const label of remove) {
      // 404 means the label is already gone — the desired end state, so do
      // not fail the step over it.
      await apiJson(`/issues/${encodeURIComponent(number)}/labels/${encodeURIComponent(label)}`, {
        method: "DELETE",
        tolerateStatuses: [404]
      });
    }
    return;
  }

  if (command === "pr-list") {
    const state = String(args.state || "open").toLowerCase();
    // No --limit means "all" — overlap/in-flight detection needs completeness.
    const limit = args.limit != null && args.limit !== true ? Math.max(Number(args.limit), 1) : Infinity;
    let pulls = await apiJsonAll(`/pulls?state=${encodeURIComponent(state)}&per_page=100`);
    if (pulls.length > limit) pulls = pulls.slice(0, limit);
    const detailed = [];
    for (const pull of pulls) {
      const [full, issue, files] = await Promise.all([
        apiJson(`/pulls/${encodeURIComponent(pull.number)}`),
        issueLike(pull.number),
        apiJsonAll(`/pulls/${encodeURIComponent(pull.number)}/files?per_page=100`)
      ]);
      detailed.push({
        number: pull.number,
        state: full.merged_at ? "MERGED" : String(full.state || "").toUpperCase(),
        labels: issue.labels || [],
        files: files.map((file) => ({ path: file.filename }))
      });
    }
    console.log(JSON.stringify(detailed));
    return;
  }

  if (command === "pr-diff") {
    const number = required(args.pr, "--pr is required");
    process.stdout.write(await apiText(`/pulls/${encodeURIComponent(number)}`, "application/vnd.github.v3.diff"));
    return;
  }

  if (command === "pr-create") {
    const repo = await repoInfo();
    const pull = await apiJson("/pulls", {
      method: "POST",
      body: {
        title: required(args.title, "--title is required"),
        body: String(args.body || ""),
        head: required(args.head, "--head is required"),
        base: args.base || repo.default_branch
      }
    });
    const labels = values(args.label);
    if (labels.length) {
      await apiJson(`/issues/${encodeURIComponent(pull.number)}/labels`, {
        method: "POST",
        body: { labels }
      });
    }
    console.log(pull.html_url || "");
    return;
  }

  if (command === "workflow-run") {
    const workflow = required(args.workflow, "--workflow is required");
    const repo = await repoInfo();
    await apiJson(`/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
      method: "POST",
      body: {
        ref: args.ref || process.env.GITHUB_REF_NAME || repo.default_branch,
        inputs: fieldsToObject(values(args.f))
      }
    });
    return;
  }

  usage(`unknown command: ${command}`);
}

async function issueLike(number) {
  return await apiJson(`/issues/${encodeURIComponent(required(number, "--issue or --pr is required"))}`);
}

async function repoInfo() {
  return await apiJson("");
}

function checkRunBodyFromArgs() {
  const conclusion = args.conclusion ? String(args.conclusion) : undefined;
  const body = {
    name: required(args.name, "--name is required"),
    head_sha: required(args["head-sha"] || process.env.GITHUB_SHA, "--head-sha is required"),
    status: String(args.status || "completed")
  };
  if (conclusion) body.conclusion = conclusion;
  if (args.title || args.summary) {
    body.output = {
      title: String(args.title || args.name),
      summary: String(args.summary || "")
    };
  }
  return body;
}

async function upsertCheckRun(body) {
  const existing = latestCheckRun(await checkRunsForCommit(body.head_sha, body.name));
  if (!existing) {
    await apiJson("/check-runs", { method: "POST", body });
    return;
  }
  const update = {
    name: body.name,
    status: body.status
  };
  if (body.conclusion) update.conclusion = body.conclusion;
  if (body.output) update.output = body.output;
  await apiJson(`/check-runs/${encodeURIComponent(existing.id)}`, {
    method: "PATCH",
    body: update
  });
}

async function checkRunsForCommit(headSha, name) {
  const payload = await apiJson(`/commits/${encodeURIComponent(headSha)}/check-runs?check_name=${encodeURIComponent(name)}&per_page=100`);
  return Array.isArray(payload?.check_runs) ? payload.check_runs : [];
}

function latestCheckRun(runs) {
  const candidates = (runs || []).filter((run) => run && run.id != null);
  candidates.sort((a, b) => {
    const bTime = Date.parse(b.started_at || b.created_at || "") || 0;
    const aTime = Date.parse(a.started_at || a.created_at || "") || 0;
    return bTime - aTime || Number(b.id) - Number(a.id);
  });
  return candidates[0] || null;
}

async function apiJson(pathname, options = {}) {
  const response = await api(pathname, options);
  if (response.status === 204) return null;
  return await response.json();
}

// Follows GitHub's Link-header pagination and concatenates the array pages, so
// callers see the full result set instead of a silently truncated first page.
async function apiJsonAll(pathname) {
  let next = pathname;
  const all = [];
  while (next) {
    const response = await api(next);
    const page = await response.json();
    if (!Array.isArray(page)) return page;
    all.push(...page);
    next = nextPagePath(response.headers.get("link"));
  }
  return all;
}

function nextPagePath(linkHeader) {
  if (!linkHeader) return "";
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) {
      const url = new URL(match[1]);
      // api() prepends https://api.github.com/repos/<owner>/<repo>; strip it.
      return url.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, "") + url.search;
    }
  }
  return "";
}

async function apiText(pathname, accept, options = {}) {
  const response = await api(pathname, { ...options, accept });
  return await response.text();
}

async function api(pathname, options = {}) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GH_TOKEN or GITHUB_TOKEN is required for GitHub API fallback");
  }
  const repo = args.repo || process.env.GITHUB_REPOSITORY || inferGithubRepository();
  if (!repo) {
    throw new Error("GITHUB_REPOSITORY or --repo owner/name is required for GitHub API fallback");
  }
  const base = `https://api.github.com/repos/${repo}`;
  const request = {
    method: options.method || "GET",
    headers: {
      "accept": options.accept || "application/vnd.github+json",
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "gitcrew-github-api-fallback",
      "x-github-api-version": "2022-11-28"
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  };

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response;
    try {
      response = await fetch(`${base}${pathname}`, { ...request, signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS) });
    } catch (error) {
      lastError = error; // network error or timeout — retry a few times
      if (attempt < MAX_RETRIES) { await sleep(backoffMs(attempt)); continue; }
      throw error;
    }
    if (shouldRetry(response) && attempt < MAX_RETRIES) {
      await sleep(retryDelayMs(response, attempt));
      continue;
    }
    if (!response.ok && !(options.tolerateStatuses || []).includes(response.status)) {
      const detail = await response.text().catch(() => "");
      throw new Error(`GitHub API ${response.status} ${response.statusText}: ${detail.slice(0, 500)}`);
    }
    return response;
  }
  throw lastError || new Error("GitHub API request failed after retries");
}

// Retry on transient failures and rate limits. GitHub signals a primary
// rate limit with 403 + x-ratelimit-remaining:0, and secondary limits with
// 403/429 + Retry-After.
function shouldRetry(response) {
  if (response.status >= 500 || response.status === 429) return true;
  if (response.status === 403) {
    return Boolean(response.headers.get("retry-after")) || response.headers.get("x-ratelimit-remaining") === "0";
  }
  return false;
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (retryAfter > 0) return Math.min(retryAfter * 1000, MAX_BACKOFF_MS);
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (reset > 0) {
    const waitMs = reset * 1000 - Date.now();
    if (waitMs > 0) return Math.min(waitMs, MAX_BACKOFF_MS);
  }
  return backoffMs(attempt);
}

function backoffMs(attempt) {
  return Math.min(BASE_BACKOFF_MS * (2 ** attempt), MAX_BACKOFF_MS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferGithubRepository() {
  const result = spawnSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return parseGithubOwnerRepo(result.stdout || "");
}

function parseGithubOwnerRepo(remote) {
  const trimmed = String(remote || "").trim().replace(/\/+$/, "");
  const patterns = [
    /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/,
    /^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/,
    /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/
  ];
  for (const re of patterns) {
    const match = trimmed.match(re);
    if (match) return match[1];
  }
  return "";
}

function fieldsToObject(fields) {
  const out = {};
  for (const field of fields) {
    const idx = String(field).indexOf("=");
    if (idx <= 0) continue;
    out[field.slice(0, idx)] = field.slice(idx + 1);
  }
  return out;
}

function values(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function required(value, message) {
  if (value == null || String(value).trim() === "") usage(message);
  return String(value);
}

function writeLines(lines) {
  if (lines.length) process.stdout.write(`${lines.join("\n")}\n`);
}

function parseArgs(argv) {
  const out = { _: [] };
  const repeat = new Set(["add-label", "remove-label", "label", "f"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    // Support --key=value so values that themselves start with "--"
    // (e.g. a comment body) are not misread as a flag.
    const key = eq === -1 ? body : body.slice(0, eq);
    const value = eq !== -1
      ? body.slice(eq + 1)
      : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true);
    if (repeat.has(key)) {
      out[key] = values(out[key]);
      out[key].push(String(value));
    } else {
      out[key] = value;
    }
  }
  return out;
}

function usage(message) {
  console.error(`github-api.js: ${message}`);
  process.exit(2);
}

// Exported for unit tests; the CLI path above is gated on require.main.
module.exports = {
  parseArgs,
  parseGithubOwnerRepo,
  nextPagePath,
  shouldRetry,
  retryDelayMs,
  backoffMs,
  latestCheckRun
};
