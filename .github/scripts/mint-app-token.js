#!/usr/bin/env node
const crypto = require("node:crypto");
const https = require("node:https");

const appId = process.env.GITHUB_APP_ID;
const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

if (!appId || !installationId || !privateKey) {
  console.error("GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, and GITHUB_APP_PRIVATE_KEY are required");
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000) - 60;
const jwt = signJwt(
  { alg: "RS256", typ: "JWT" },
  { iat: now, exp: now + 540, iss: appId },
  privateKey
);

requestInstallationToken(jwt, installationId)
  .then((token) => {
    console.log(`token=${token}`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });

function signJwt(header, payload, key) {
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createSign("RSA-SHA256").update(data).sign(key);
  return `${data}.${base64Url(signature)}`;
}

function base64Url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function requestInstallationToken(jwt, installationId) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.github.com",
      path: `/app/installations/${installationId}/access_tokens`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "engineering-automation"
      }
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub token exchange failed: HTTP ${res.statusCode}`));
          return;
        }
        const parsed = JSON.parse(body);
        if (!parsed.token) {
          reject(new Error("GitHub token exchange response did not include token"));
          return;
        }
        resolve(parsed.token);
      });
    });
    req.on("error", reject);
    req.end();
  });
}
