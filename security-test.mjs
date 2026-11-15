// Security regression test for sentinel-sentiment.
// Run from repo root:
//   APP_PASSWORD="TestPass123Strong" \
//   SESSION_SECRET="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" \
//   NODE_ENV=production node security-test.mjs
//
// Exit code 0 = all checks pass. Exit code 1 = at least one regression.

import crypto from 'crypto';
import app from './server.js';

const srv = app.listen(0);
await new Promise((r) => srv.once('listening', r));
const B = `http://127.0.0.1:${srv.address().port}`;

let pass = 0;
let fail = 0;
const chk = (name, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' ' + extra : ''}`);
};
const post = (p, body, headers = {}) =>
  fetch(B + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

// ---- F-01: default password must not work ----
let r = await post('/api/auth/login', { password: 'sentinel2026' });
chk('F-01 old default password rejected', r.status === 401, `-> ${r.status}`);

// ---- F-02: token forged with the old default secret must be rejected ----
const exp = Date.now() + 86_400_000;
const payload = `v1:${exp}`;
const forgedSig = crypto
  .createHmac('sha256', 'sentinel_vault_secret_default_key_2026')
  .update(payload)
  .digest('hex');
r = await fetch(B + '/api/auth/status', {
  headers: { 'x-sentinel-auth': `${payload}.${forgedSig}` },
});
chk(
  'F-02 token forged with old default secret rejected',
  (await r.json()).authenticated === false,
);

// ---- F-05: login response must not leak the token into JS-readable space ----
r = await post('/api/auth/login', { password: process.env.APP_PASSWORD });
const loginBody = await r.json();
chk('F-05 login accepted', r.status === 200, `-> ${r.status}`);
chk('F-05 token absent from login response body', loginBody.token === undefined);

// ---- F-10: framework header removed ----
chk('F-10 x-powered-by absent', !r.headers.get('x-powered-by'));

// ---- F-09: CSP frame-ancestors prevents clickjacking ----
const csp = r.headers.get('content-security-policy') || '';
chk('F-09 CSP frame-ancestors present', csp.includes("frame-ancestors 'none'"));

// ---- F-08: no-store on failed login ----
r = await post('/api/auth/login', { password: 'wrong-password' });
const cc = r.headers.get('cache-control') || '';
chk('F-08 no-store on failed login', cc.includes('no-store'), `-> ${cc}`);

// ---- F-03: logout must actually revoke ----
r = await post('/api/auth/login', { password: process.env.APP_PASSWORD });
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
let s = await fetch(B + '/api/auth/status', { headers: { Cookie: cookie } });
chk('F-03 session valid before logout', (await s.json()).authenticated === true);

await fetch(B + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
s = await fetch(B + '/api/auth/status', { headers: { Cookie: cookie } });
chk('F-03 session dead after logout', (await s.json()).authenticated === false);

// ---- Regression guard: gated routes stay gated ----
for (const path of ['/api/news', '/api/sentiment/crypto', '/api/sentiment/forex']) {
  const res = await fetch(B + path);
  chk(`guard ${path} still 401 unauthenticated`, res.status === 401, `-> ${res.status}`);
}

// ---- Regression guard: valid session still reaches data ----
r = await post('/api/auth/login', { password: process.env.APP_PASSWORD });
const good = (r.headers.get('set-cookie') || '').split(';')[0];
const newsRes = await fetch(B + '/api/news', { headers: { Cookie: good } });
chk('guard valid session can reach /api/news', newsRes.status === 200, `-> ${newsRes.status}`);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
srv.close();
process.exit(fail ? 1 : 0);
