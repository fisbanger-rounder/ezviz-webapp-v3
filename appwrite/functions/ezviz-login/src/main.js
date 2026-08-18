/**
 * Appwrite Function: ezviz-login
 * Runtime: node-18.0
 *
 * ── What this function does ────────────────────────────────────────────────
 * 1. Verifies the submitted username + password against EZVIZ_ADMIN_USERNAME
 *    and EZVIZ_ADMIN_PASSWORD stored in Appwrite Function Variables.
 * 2. If credentials match, calls the EZVIZ app-level token endpoint
 *    (per the official EZVIZ Open Platform docs):
 *      POST https://open.ezvizlife.com/api/lapp/token/get
 *      body: appKey + appSecret
 * 3. Returns { accessToken, areaDomain } to the browser.
 *
 * ── Appwrite Function Variables required ──────────────────────────────────
 *   EZVIZ_APP_KEY          → your EZVIZ developer AppKey
 *   EZVIZ_APP_SECRET       → your EZVIZ developer AppSecret
 *   EZVIZ_ADMIN_USERNAME   → the username to accept on the login form
 *   EZVIZ_ADMIN_PASSWORD   → the password to accept on the login form
 *
 * ── Why open.ezvizlife.com? ────────────────────────────────────────────────
 * The EZVIZ API docs specify https://open.ezvizlife.com as the token
 * endpoint host. Regional hosts (isgpopen, iusopen, etc.) are returned in
 * the areaDomain field and are only used for CAMERA API calls, not for
 * obtaining tokens.
 *
 * ── Deploy ─────────────────────────────────────────────────────────────────
 * 1. Runtime: Node.js 18.0, Entrypoint: src/main.js
 * 2. Set the four Variables above (encrypted)
 * 3. Permissions → Execute → "Any"
 * 4. Upload tar.gz of this folder (excluding node_modules)
 */

// NODE_TLS_REJECT_UNAUTHORIZED is respected by Node's built-in https module
// (but NOT by the fetch() API in Node 18). We use https.request() below.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import https from 'https';
import { URL } from 'url';

// ── Per EZVIZ API docs: token requests always go to the global endpoint ────
// Do NOT use a regional URL here — the regional domain (areaDomain) is
// returned IN the token response and used only for subsequent camera API calls.
const EZVIZ_TOKEN_BASE = 'https://open.ezvizlife.com';

/**
 * POST application/x-www-form-urlencoded via Node's https module.
 * Resolves with the parsed JSON body (merged with HTTP statusCode).
 * Rejects with a descriptive error if the response is not valid JSON.
 */
function httpsPost(urlStr, formBody) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const data      = formBody.toString();

    const options = {
      hostname:           parsedUrl.hostname,
      port:               parsedUrl.port || 443,
      path:               parsedUrl.pathname + (parsedUrl.search || ''),
      method:             'POST',
      rejectUnauthorized: false,   // bypass expired/self-signed certs on EZVIZ servers
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        const statusCode = res.statusCode;
        try {
          const json = JSON.parse(raw);
          resolve({ statusCode, ...json });
        } catch (_e) {
          reject(new Error(
            `HTTP ${statusCode} — server returned non-JSON. ` +
            `First 400 chars: ${raw.slice(0, 400)}`
          ));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Main handler ──────────────────────────────────────────────────────────

export default async ({ req, res, log, error }) => {
  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    return res.empty();
  }

  // ── Read server-side secrets from Appwrite Function Variables ─────────
  const appKey        = process.env.EZVIZ_APP_KEY;
  const appSecret     = process.env.EZVIZ_APP_SECRET;
  const adminUsername = process.env.EZVIZ_ADMIN_USERNAME;
  const adminPassword = process.env.EZVIZ_ADMIN_PASSWORD;

  if (!appKey || !appSecret) {
    error('EZVIZ_APP_KEY or EZVIZ_APP_SECRET is not set.');
    return res.json({ error: 'Server misconfiguration: EZVIZ API credentials not set.' }, 500);
  }

  // ── Parse request body ────────────────────────────────────────────────
  let body = {};
  if (typeof req.body === 'object' && req.body !== null) {
    body = req.body;
  } else {
    const raw = (typeof req.body === 'string' && req.body) || req.bodyRaw || '{}';
    try {
      body = JSON.parse(raw);
    } catch (_e) {
      error(`Failed to parse request body: ${raw}`);
      return res.json({ error: 'Invalid JSON body.' }, 400);
    }
  }

  const { account, password } = body;

  if (!account || !password) {
    return res.json({ error: '`account` and `password` are required.' }, 400);
  }

  // ── Verify login credentials ──────────────────────────────────────────
  // If EZVIZ_ADMIN_USERNAME / EZVIZ_ADMIN_PASSWORD are set in Appwrite
  // Variables, enforce them. Otherwise skip the check (open access).
  if (adminUsername && adminPassword) {
    const usernameOk = account.trim().toLowerCase() === adminUsername.trim().toLowerCase();
    const passwordOk = password === adminPassword;
    if (!usernameOk || !passwordOk) {
      log(`Failed login attempt for account: ${account}`);
      return res.json({ error: 'Invalid username or password.' }, 401);
    }
  }

  log(`Login accepted for: ${account}`);
  log(`Node version: ${process.version}`);

  // ── Call EZVIZ token endpoint (per official API docs) ─────────────────
  // Endpoint: POST https://open.ezvizlife.com/api/lapp/token/get
  // Params:   appKey, appSecret
  // Docs ref: EZVIZ Open Platform — 1.1 Get accessToken via appKey and secret
  const tokenUrl = `${EZVIZ_TOKEN_BASE}/api/lapp/token/get`;
  log(`Calling EZVIZ token endpoint: ${tokenUrl}`);

  let tokenData;
  try {
    tokenData = await httpsPost(tokenUrl, new URLSearchParams({ appKey, appSecret }));
  } catch (fetchErr) {
    const msg = fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr);
    error(`EZVIZ token fetch failed: ${msg}`);
    return res.json({ error: `Could not reach the EZVIZ server. Detail: ${msg}` }, 502);
  }

  log(`EZVIZ response code: ${tokenData.code}, HTTP status: ${tokenData.statusCode}`);

  // ── Handle EZVIZ API-level errors (per docs return codes) ────────────
  switch (tokenData.code) {
    case '200':
      log('Token obtained successfully.');
      return res.json({
        accessToken : tokenData.data.accessToken,
        areaDomain  : tokenData.data.areaDomain,
        expireTime  : tokenData.data.expireTime,
      });

    case '10001':
      error('EZVIZ: Parameter empty or incorrect format (10001).');
      return res.json({ error: 'EZVIZ API error: Parameter empty or incorrect format.' }, 400);

    case '10005':
      error('EZVIZ: AppKey is frozen (10005).');
      return res.json({ error: 'EZVIZ AppKey is frozen. Contact EZVIZ support.' }, 403);

    case '10017':
      error('EZVIZ: AppKey does not exist (10017).');
      return res.json({ error: 'EZVIZ AppKey does not exist. Check your AppKey value.' }, 403);

    case '10030':
      error('EZVIZ: AppKey and AppSecret mismatch (10030).');
      return res.json({ error: 'EZVIZ AppKey and AppSecret do not match.' }, 403);

    case '49999':
      error(`EZVIZ: Data exception (49999): ${tokenData.msg}`);
      return res.json({ error: 'EZVIZ API call exception. Please try again.' }, 500);

    default:
      error(`EZVIZ returned unexpected code: ${tokenData.code} — ${tokenData.msg}`);
      return res.json({
        error: tokenData.msg || `Unexpected EZVIZ error code: ${tokenData.code}`,
      }, 400);
  }
};
