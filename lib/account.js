// Account deletion, as Google Play requires for any app that lets people sign up: the user's
// rows in every table, their files in Storage, and finally the auth user itself.
//
// The browser can't do this alone. RLS lets a user delete only some of their own rows (not
// messages they sent, for example), and removing an auth user needs the service-role key,
// which must never leave the server. So the client sends its access token, the server checks
// it with Supabase, and then deletes everything belonging to that user id with the
// service-role key.

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DELETE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY && SERVICE_KEY);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_BUCKETS = ['avatars', 'diagrams']; // both keep a user's files under "<user-id>/"
const TIMEOUT_MS = 10000;

class DeleteError extends Error {
  constructor(step, status, detail) {
    super('account delete failed at ' + step + ' (HTTP ' + status + '): ' + String(detail || '').slice(0, 300));
    this.step = step;
  }
}

function adminHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra);
}

// Who is asking. Always a fresh check (no cache): this is the one call that can't be undone.
async function userIdFromToken(token) {
  const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  const id = user && user.id ? String(user.id) : '';
  return UUID_RE.test(id) ? id : null;
}

// Tables were made in the dashboard, so a project may lack one. PostgREST answers 404
// (PGRST205) or 42P01 for a missing table; that is "nothing to delete", not a failure.
function isMissingTable(status, body) {
  return status === 404 || /PGRST205|42P01|does not exist|Could not find the table/i.test(body);
}

async function rest(method, table, query, step) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
    method,
    headers: adminHeaders({ Prefer: 'return=minimal' }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.text();
  if (res.ok) return method === 'GET' ? JSON.parse(body || '[]') : null;
  if (isMissingTable(res.status, body)) return method === 'GET' ? [] : null;
  throw new DeleteError(step, res.status, body);
}

async function deleteRows(uid) {
  // Rows that point at other rows go first, in case the tables have foreign keys without
  // ON DELETE CASCADE.
  const hosted = await rest('GET', 'rooms', 'select=code&host_user_id=eq.' + uid, 'rooms:list');
  const codes = hosted.map((r) => r && r.code).filter((c) => typeof c === 'string' && c);
  if (codes.length) {
    const list = codes.map((c) => '"' + c.replace(/["\\]/g, '') + '"').join(',');
    await rest('DELETE', 'room_players', 'room_code=in.(' + encodeURIComponent(list) + ')', 'room_players:hosted');
  }
  await rest('DELETE', 'room_players', 'user_id=eq.' + uid, 'room_players');
  await rest('DELETE', 'rooms', 'host_user_id=eq.' + uid, 'rooms');
  await rest('DELETE', 'messages', 'or=(sender_id.eq.' + uid + ',receiver_id.eq.' + uid + ')', 'messages');
  await rest('DELETE', 'friendships', 'or=(requester_id.eq.' + uid + ',addressee_id.eq.' + uid + ')', 'friendships');
  await rest('DELETE', 'events', 'user_id=eq.' + uid, 'events');
  await rest('DELETE', 'quiz_history', 'user_id=eq.' + uid, 'quiz_history');
  await rest('DELETE', 'profiles', 'id=eq.' + uid, 'profiles');
}

async function deleteFiles(uid) {
  for (const bucket of STORAGE_BUCKETS) {
    // A list call returns at most `limit` names, so keep going until the folder is empty.
    for (let round = 0; round < 50; round++) {
      const listRes = await fetch(SUPABASE_URL + '/storage/v1/object/list/' + bucket, {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ prefix: uid + '/', limit: 1000, offset: 0 }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const listBody = await listRes.text();
      if (!listRes.ok) {
        if (/bucket not found|not_found/i.test(listBody) || listRes.status === 404) break;
        throw new DeleteError('storage:' + bucket + ':list', listRes.status, listBody);
      }
      const items = JSON.parse(listBody || '[]');
      const paths = items.map((o) => o && o.name).filter(Boolean).map((n) => uid + '/' + n);
      if (!paths.length) break;
      const delRes = await fetch(SUPABASE_URL + '/storage/v1/object/' + bucket, {
        method: 'DELETE',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ prefixes: paths }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!delRes.ok) throw new DeleteError('storage:' + bucket + ':delete', delRes.status, await delRes.text());
    }
  }
}

async function deleteAuthUser(uid) {
  const res = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + uid, {
    method: 'DELETE',
    headers: adminHeaders(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 404) throw new DeleteError('auth', res.status, await res.text());
}

async function deleteAccount(uid) {
  if (!UUID_RE.test(uid)) throw new Error('not a user id');
  await deleteRows(uid);
  await deleteFiles(uid);
  await deleteAuthUser(uid); // last, so a failure above can be retried while the login still works
}

// POST /api/account/delete  (Authorization: Bearer <access token>, body { confirm: "DELETE" })
async function deleteAccountRoute(req, res) {
  if (!DELETE_CONFIGURED) {
    return res.status(503).json({
      error: 'Account deletion is not available right now. Email hello@bucktheduck.site and we will delete it for you.',
      code: 'DELETE_UNAVAILABLE',
    });
  }
  if (!req.body || req.body.confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Confirm the deletion to continue.', code: 'CONFIRM_REQUIRED' });
  }
  const header = String(req.headers.authorization || '');
  const token = /^Bearer\s+(.+)$/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';
  try {
    const uid = token ? await userIdFromToken(token) : null;
    if (!uid) {
      return res.status(401).json({ error: 'Sign in again, then delete your account.', code: 'SIGNIN_REQUIRED' });
    }
    await deleteAccount(uid);
    return res.json({ deleted: true });
  } catch (err) {
    console.error('[account] delete failed:', err.message);
    return res.status(502).json({
      error: 'Buck could not delete your account just now. Try again, or email hello@bucktheduck.site.',
      code: 'DELETE_FAILED',
    });
  }
}

module.exports = { deleteAccountRoute, deleteConfigured: DELETE_CONFIGURED };
