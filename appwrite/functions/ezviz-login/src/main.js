/**
 * Appwrite Function: ezviz-login
 * Runtime: node-18.0
 *
 * Accepts  → { account, password, region } in the request body
 * Uses     → EZVIZ_APP_KEY + EZVIZ_APP_SECRET from Function environment variables
 * Returns  → { accessToken, areaDomain }  (or { error } on failure)
 *
 * AppKey and AppSecret are stored in Appwrite's encrypted Variables —
 * they never reach the browser.
 *
 * ── Deploy via Appwrite Console ────────────────────────────────────────────
 * 1. Create a new Function in the Appwrite Console
 *    Runtime: Node.js 18.0
 *    Entrypoint: src/main.js
 * 2. Set Variables (encrypted):
 *    EZVIZ_APP_KEY   = <your appkey>
 *    EZVIZ_APP_SECRET = <your appsecret>
 * 3. Under Permissions → add "Any" to Execute
 * 4. Deploy by uploading a zip of this folder (excluding node_modules)
 */

const DEFAULT_REGION = 'https://isgpopen.ezvizlife.com';

export default async ({ req, res, log, error }) => {
  // ── CORS pre-flight ────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return res.empty();
  }

  // ── Read EZVIZ credentials from Appwrite Variables (server-side only) ─────
  const appKey    = process.env.EZVIZ_APP_KEY;
  const appSecret = process.env.EZVIZ_APP_SECRET;

  if (!appKey || !appSecret) {
    error('EZVIZ_APP_KEY or EZVIZ_APP_SECRET is not set in Function Variables.');
    return res.json({ error: 'Server misconfiguration: EZVIZ credentials not set.' }, 500);
  }

  // ── Parse request body ─────────────────────────────────────────────────────
  let body = {};
  try {
    body = JSON.parse(req.body || '{}');
  } catch (_e) {
    return res.json({ error: 'Invalid JSON body.' }, 400);
  }

  const { account, password, region = DEFAULT_REGION } = body;

  if (!account || !password) {
    return res.json({ error: '`account` and `password` are required.' }, 400);
  }

  log(`Login attempt for account: ${account} via region: ${region}`);

  // ── Call EZVIZ user-token endpoint ─────────────────────────────────────────
  const params = new URLSearchParams({ appKey, appSecret, account, password });

  let ezvizData;
  try {
    const ezvizResp = await fetch(`${region}/api/lapp/user/token/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    ezvizData = await ezvizResp.json();
  } catch (fetchErr) {
    error(`EZVIZ fetch error: ${fetchErr}`);
    return res.json({ error: 'Could not reach the EZVIZ server. Check the region setting.' }, 502);
  }

  // ── Handle success ─────────────────────────────────────────────────────────
  if (ezvizData.code === '200') {
    log('Login successful.');
    return res.json({
      accessToken : ezvizData.data.accessToken,
      areaDomain  : ezvizData.data.areaDomain ?? region,
      expireTime  : ezvizData.data.expireTime,
    });
  }

  // ── Handle wrong credentials (don't fall back — wrong password is wrong) ───
  const isCredentialError = ['10002', '10011', '20002', '60041'].includes(ezvizData.code);
  if (isCredentialError) {
    log(`Credential error: ${ezvizData.code} — ${ezvizData.msg}`);
    return res.json(
      { error: ezvizData.msg || 'Invalid EZVIZ username or password.' },
      401,
    );
  }

  // ── Fallback: app-level token (appKey + appSecret only) ────────────────────
  // Some EZVIZ app configurations don't support the user-token endpoint.
  // Fall back to the app-level token so login still succeeds.
  log(`User-token endpoint returned code ${ezvizData.code}. Trying app-level fallback…`);

  let fallbackData;
  try {
    const fallbackResp = await fetch(`${region}/api/lapp/token/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ appKey, appSecret }).toString(),
    });
    fallbackData = await fallbackResp.json();
  } catch (fetchErr) {
    error(`Fallback fetch error: ${fetchErr}`);
    return res.json({ error: ezvizData.msg || 'Login failed.' }, 400);
  }

  if (fallbackData.code === '200') {
    log('Fallback app-level login succeeded.');
    return res.json({
      accessToken : fallbackData.data.accessToken,
      areaDomain  : fallbackData.data.areaDomain ?? region,
      expireTime  : fallbackData.data.expireTime,
    });
  }

  error(`Both login attempts failed. User: ${ezvizData.code}, App: ${fallbackData.code}`);
  return res.json(
    { error: ezvizData.msg || fallbackData.msg || 'Login failed. Please check your credentials.' },
    400,
  );
};
