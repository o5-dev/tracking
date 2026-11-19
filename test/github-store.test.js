const vm = require('vm'), fs = require('fs'), assert = require('assert');
const root = require('path').join(__dirname, '..', 'js') + '/';

const files = new Map(); // path -> {content(b64), sha}
let n = 0, shaCounter = 0;
const calls = [];
function json(status, body) { return { status, ok: status >= 200 && status < 300, json: async () => body }; }

async function fetchMock(url, init) {
  init = init || {};
  const u = new URL(url);
  calls.push((init.method || 'GET') + ' ' + u.pathname);
  if (u.hostname === 'localhost') { // veřejný GitHub Pages soubor
    const f = files.get(u.pathname.replace(/^\//, ''));
    if (!f) return json(404, null);
    return json(200, JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')));
  }
  assert.strictEqual(u.hostname, 'api.github.com');
  assert.ok(/^Bearer tok/.test(init.headers.Authorization), 'auth header');
  const p = u.pathname.replace('/repos/own/rep', '');
  if (p === '') return json(200, { permissions: { push: true } });
  if (p === '/contents/data/p' && !init.method) {
    const list = [...files.keys()].filter(k => k.startsWith('data/p/')).map(k => ({ name: k.split('/').pop() }));
    return list.length ? json(200, list) : json(404, { message: 'Not Found' });
  }
  const m = p.match(/^\/contents\/(data\/p\/.+)$/);
  if (!m) return json(500, { message: 'unexpected ' + p });
  const path = m[1], cur = files.get(path);
  if (!init.method) return cur ? json(200, { sha: cur.sha, content: cur.content }) : json(404, { message: 'Not Found' });
  const body = JSON.parse(init.body);
  assert.strictEqual(body.branch, 'main');
  if (init.method === 'PUT') {
    if (cur && !body.sha) return json(422, { message: 'sha wasn\'t supplied' });
    if (cur && body.sha !== cur.sha) return json(409, { message: 'conflict' });
    const sha = 'sha' + (++shaCounter);
    files.set(path, { content: body.content, sha });
    return json(200, { content: { sha } });
  }
  if (init.method === 'DELETE') { if (!cur || cur.sha !== body.sha) return json(409, {}); files.delete(path); return json(200, {}); }
}

const store = {};
const ctx = {
  console, fetch: fetchMock, URL, TextEncoder, Intl, Date, JSON, Math, Promise, Uint8Array, atob, btoa, unescape, escape, encodeURIComponent, decodeURIComponent, setTimeout,
  crypto: globalThis.crypto,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: { baseURI: 'http://localhost/', createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }), createElementNS: () => ({ setAttribute() {}, appendChild() {} }), createTextNode: () => ({ nodeType: 3 }) },
  navigator: {},
};
ctx.window = ctx; ctx.window.TRASA_CONFIG = { githubRepo: 'own/rep', githubBranch: 'main' };
vm.createContext(ctx);
for (const f of ['common.js', 'api.js']) vm.runInContext(fs.readFileSync(root + f, 'utf8'), ctx, { filename: f });
const T = ctx.Trasa;

(async () => {
  assert.strictEqual(T.isDemo, false);
  assert.strictEqual(await T.api.admin.getSession(), null);
  const A = T.api.admin;
  const s = await A.signIn('tok123');
  assert.strictEqual(s.email, 'own/rep');
  assert.ok(await A.getSession());
  assert.strictEqual((await A.list()).length, 0, 'empty dir');

  const p = await A.create({ description: 'Balík – boty', carrier: 'PPL', origin: 'Praha', destination: 'Plzeň', estimated_delivery: '2026-12-01', estimated_delivery_to: null, recipient_name: 'Eva Dvořáková', recipient_phone: '+420 602 111 222' });
  assert.match(p.tracking_code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.strictEqual(p.recipient, 'E** D*****');
  assert.strictEqual(p.recipient_phone, '*** *** 222');
  assert.strictEqual(p.id, await T.hashCode(p.tracking_code));
  const raw = Buffer.from([...files.values()][0].content, 'base64').toString('utf8');
  assert.ok(!/Eva|Dvořák|602 111/.test(raw), 'plain personal data must not be stored');
  console.log('stored file:\n' + raw.slice(0, 400));

  // veřejné vyhledání – písmena kódu v jiné velikosti / bez pomlček
  const pub = await T.api.track(p.tracking_code.toLowerCase().replace(/-/g, ' '));
  assert.strictEqual(pub.status, 'created');
  assert.strictEqual(await T.api.track('AAAA-BBBB-CCCC'), null);

  await A.addEvent(p.id, { status: 'in_transit', location: 'Jihlava', note: 'Na cestě' });
  await A.addEvent(p.id, { status: 'delivered', location: 'Plzeň' });
  const pub2 = await T.api.track(p.tracking_code);
  assert.strictEqual(pub2.status, 'delivered');
  assert.strictEqual(pub2.events.map(e => e.status).join(','), 'delivered,in_transit,created');
  assert.ok(pub2.events.every(e => e.at));

  await A.update(p.id, { description: 'Balík – boty (nové)', carrier: null, origin: 'Praha', destination: 'Plzeň', estimated_delivery: null, estimated_delivery_to: null, recipient_name: null, recipient_phone: null });
  const l = await A.list();
  assert.strictEqual(l.length, 1);
  assert.strictEqual(l[0].description, 'Balík – boty (nové)');
  assert.strictEqual(l[0].recipient, 'E** D*****', 'empty name keeps masked value');
  assert.strictEqual(l[0].status, 'delivered');

  // kolize kódu: první vygenerovaný kód existuje → zkusí další
  const origGen = T.generateCode; let first = true;
  T.generateCode = () => { if (first) { first = false; return p.tracking_code; } return origGen(); };
  const p2 = await A.create({ description: 'Druhá', recipient_name: 'Jan Novák' });
  assert.notStrictEqual(p2.tracking_code, p.tracking_code);
  T.generateCode = origGen;
  assert.strictEqual((await A.list()).length, 2);

  await A.remove(p.id);
  assert.strictEqual(await T.api.track(p.tracking_code), null);
  assert.strictEqual((await A.list()).length, 1);

  await A.signOut();
  assert.strictEqual(await A.getSession(), null);
  console.log('ALL OK;', calls.length, 'calls');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
