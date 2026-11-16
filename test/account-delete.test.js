// Delete account (a Google Play requirement) and the Android assetlinks file. Supabase is
// faked, so these tests pin down exactly which requests the server makes.
const test = require('node:test');
const assert = require('node:assert/strict');

const SB = 'https://fake-project.supabase.co';
const USER = '11111111-2222-4333-8444-555555555555';
const FP = Array.from({ length: 32 }, (_, i) => (i + 16).toString(16).toUpperCase()).join(':');

const calls = [];
let roomCodes = ['ABC123'];
let missingTables = [];
let failAuthDelete = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (!url.startsWith(SB)) return realFetch(url, opts);
  const method = opts.method || 'GET';
  const path = decodeURIComponent(url.slice(SB.length));
  const key = (opts.headers && (opts.headers.Authorization || opts.headers.authorization)) || '';
  calls.push({ method, path, key, body: opts.body ? JSON.parse(opts.body) : null });
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (path === '/auth/v1/user') return key === 'Bearer good-token' ? json(200, { id: USER }) : json(401, { msg: 'bad jwt' });
  const table = (path.match(/^\/rest\/v1\/([a-z_]+)/) || [])[1];
  if (table && missingTables.includes(table)) return json(404, { code: 'PGRST205', message: 'Could not find the table' });
  if (method === 'GET' && table === 'rooms') return json(200, roomCodes.map((code) => ({ code })));
  if (table) return new Response(null, { status: 204 });
  if (path === '/storage/v1/object/list/avatars') {
    const done = calls.some((c) => c.method === 'DELETE' && c.path === '/storage/v1/object/avatars');
    return json(200, done ? [] : [{ name: 'avatar.jpg' }]);
  }
  if (path === '/storage/v1/object/list/diagrams') return json(400, { error: 'Bucket not found' });
  if (path.startsWith('/storage/v1/object/')) return json(200, []);
  if (path === '/auth/v1/admin/users/' + USER) return failAuthDelete ? json(500, { msg: 'boom' }) : json(200, {});
  return json(500, { msg: 'unexpected ' + method + ' ' + path });
};

const { loadServer, listen } = require('./helpers/server');
const { app } = loadServer({
  env: {
    SUPABASE_URL: SB,
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ANDROID_PACKAGE_NAME: 'site.bucktheduck.app',
    ANDROID_SHA256_FINGERPRINTS: FP.toLowerCase() + ', not-a-fingerprint',
  },
});

let api;
test.before(async () => { api = await listen(app); });
test.after(() => api.close());

const del = async (token, body = { confirm: 'DELETE' }) => {
  const res = await fetch(api.base + '/api/account/delete', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

test('deletes every table row, stored file and finally the login of the signed-in user', async () => {
  calls.length = 0;
  const res = await del('good-token');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { deleted: true });

  const deletes = calls.filter((c) => c.method === 'DELETE').map((c) => c.path);
  assert.deepEqual(deletes, [
    '/rest/v1/room_players?room_code=in.("ABC123")',
    '/rest/v1/room_players?user_id=eq.' + USER,
    '/rest/v1/rooms?host_user_id=eq.' + USER,
    `/rest/v1/messages?or=(sender_id.eq.${USER},receiver_id.eq.${USER})`,
    `/rest/v1/friendships?or=(requester_id.eq.${USER},addressee_id.eq.${USER})`,
    '/rest/v1/events?user_id=eq.' + USER,
    '/rest/v1/quiz_history?user_id=eq.' + USER,
    '/rest/v1/profiles?id=eq.' + USER,
    '/storage/v1/object/avatars',
    '/auth/v1/admin/users/' + USER,
  ]);
  const avatarDelete = calls.find((c) => c.path === '/storage/v1/object/avatars' && c.method === 'DELETE');
  assert.deepEqual(avatarDelete.body, { prefixes: [USER + '/avatar.jpg'] });
  for (const c of calls.filter((x) => x.path !== '/auth/v1/user')) {
    assert.equal(c.key, 'Bearer service-key', 'admin calls use the service-role key: ' + c.path);
  }
});

test('a table the project does not have is skipped, not an error', async () => {
  missingTables = ['events', 'rooms'];
  try {
    const res = await del('good-token');
    assert.equal(res.status, 200);
  } finally { missingTables = []; }
});

test('refuses without a valid session or without the explicit confirmation, and deletes nothing', async () => {
  calls.length = 0;
  assert.equal((await del(null)).status, 401);
  assert.equal((await del('stolen-or-expired')).status, 401);
  assert.equal((await del('good-token', {})).status, 400);
  assert.equal((await del('good-token', { confirm: true })).status, 400);
  assert.ok(!calls.some((c) => c.method === 'DELETE'), 'nothing may be deleted');
});

test('a failure is reported as one, not as success', async () => {
  failAuthDelete = true;
  try {
    const res = await del('good-token');
    assert.equal(res.status, 502);
    assert.equal(res.body.code, 'DELETE_FAILED');
  } finally { failAuthDelete = false; }
});

test('assetlinks.json names the Android app and only well-formed fingerprints', async () => {
  const res = await fetch(api.base + '/.well-known/assetlinks.json');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await res.json(), [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: 'site.bucktheduck.app', sha256_cert_fingerprints: [FP] },
  }]);
});

test('the public delete-account page is served and linked from the privacy policy', async () => {
  const page = await fetch(api.base + '/delete-account');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Delete your account/);
  assert.match(html, /href="\/app#delete-account"/);
  assert.match(await (await fetch(api.base + '/privacy')).text(), /href="\/delete-account"/);
});
