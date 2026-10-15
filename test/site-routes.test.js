// What search engines see: real robots.txt and sitemap, real pages as 200, made-up pages as 404,
// and the signed-in app kept out of search results.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadServer, listen } = require('./helpers/server');

const { app } = loadServer();
let api;
test.before(async () => { api = await listen(app); });
test.after(() => api.close());

const get = async (path) => {
  const res = await fetch(api.base + path, { redirect: 'manual' });
  return { status: res.status, type: res.headers.get('content-type') || '', body: await res.text() };
};

test('robots.txt and sitemap.xml are real files, not the homepage', async () => {
  const robots = await get('/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.type, /text\/plain/);
  assert.match(robots.body, /Sitemap: https:\/\/www\.bucktheduck\.site\/sitemap\.xml/);
  assert.match(robots.body, /Disallow: \/app/);

  const sitemap = await get('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.type, /xml/);
  assert.match(sitemap.body, /<loc>https:\/\/www\.bucktheduck\.site\/<\/loc>/);
});

test('real pages answer 200; made-up addresses answer 404', async () => {
  for (const path of ['/', '/app', '/privacy', '/terms']) {
    assert.equal((await get(path)).status, 200, path);
  }
  const missing = await get('/this-page-does-not-exist');
  assert.equal(missing.status, 404);
  assert.match(missing.body, /Buck the Duck/, 'still shows the landing page to people');
});

test('the landing page names its canonical address; the app asks not to be indexed', async () => {
  assert.match((await get('/')).body, /<link rel="canonical" href="https:\/\/www\.bucktheduck\.site\/"/);
  assert.match((await get('/app')).body, /<meta name="robots" content="noindex"/);
});
