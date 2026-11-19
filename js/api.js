/*
 * Datová vrstva bez serveru.
 *
 * Každá zásilka je jeden JSON soubor v repozitáři:  data/p/<SHA-256 kódu>.json
 *   - Návštěvník zná jen sledovací kód → spočítá hash → stáhne jediný soubor.
 *     Web nikde nevypisuje seznam zásilek.
 *   - Správce zapisuje přes GitHub API s osobním přístupovým tokenem, který
 *     zadá v panelu (zůstává jen v jeho prohlížeči, do repozitáře se nikdy neukládá).
 *   - V souboru jsou jen údaje určené k zobrazení; jméno a telefon příjemce se
 *     ukládají už zkrácené ("J*** N*****", "*** *** 456"). Celé údaje se nikam neukládají.
 *
 * Bez nastaveného githubRepo v config.js běží DEMO režim (localStorage).
 *
 * Veřejné rozhraní:  Trasa.api.track(kód)  →  záznam zásilky | null
 * Správce:           Trasa.api.admin.{getSession, signIn, signOut, list, create, addEvent, update, remove}
 */
(function () {
  'use strict';
  const T = (window.Trasa = window.Trasa || {});
  const cfg = window.TRASA_CONFIG || {};
  const isDemo = !cfg.githubRepo;
  T.isDemo = isDemo;
  const DIR = 'data/p';

  function E(code, message, status) { const e = new Error(message || code); e.code = code; e.status = status; return e; }

  T.hashCode = async function (code) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(T.normalizeCode(code)));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  };

  /* ======================= Úložiště: GitHub ======================= */
  function githubStore() {
    const parts = cfg.githubRepo.split('/');
    const owner = parts[0], repo = parts[1];
    const branch = cfg.githubBranch || 'main';
    const TOKEN_KEY = 'trasa-gh-token';
    const repoPath = '/repos/' + owner + '/' + repo;

    function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
    function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignorovat */ } }

    async function gh(path, init) {
      let res;
      try {
        res = await fetch('https://api.github.com' + path, Object.assign({ cache: 'no-store' }, init, {
          headers: Object.assign({
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            Authorization: 'Bearer ' + getToken()
          }, init && init.headers)
        }));
      } catch (e) { throw E('NETWORK', 'Network error'); }
      let body = null;
      if (res.status !== 204) { try { body = await res.json(); } catch (e) { body = null; } }
      if (res.status === 401) throw E('AUTH', 'Bad credentials', 401);
      if (!res.ok) throw E('HTTP', (body && body.message) || ('HTTP ' + res.status), res.status);
      return body;
    }

    function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
    function b64dec(b64) { return decodeURIComponent(escape(atob(b64.replace(/\s/g, '')))); }
    const filePath = function (id) { return repoPath + '/contents/' + DIR + '/' + id + '.json'; };

    async function getFile(id) {
      const f = await gh(filePath(id) + '?ref=' + encodeURIComponent(branch));
      return { id: id, sha: f.sha, data: JSON.parse(b64dec(f.content)) };
    }

    return {
      auth: {
        token: getToken,
        async signIn(token) {
          setToken(token.trim());
          try {
            const r = await gh(repoPath);
            if (!r.permissions || !r.permissions.push) throw E('NOPUSH', 'No write access', 403);
            return { email: owner + '/' + repo };
          } catch (e) { setToken(null); throw e; }
        },
        async session() {
          if (!getToken()) return null;
          try {
            const r = await gh(repoPath);
            return r.permissions && r.permissions.push ? { email: owner + '/' + repo } : null;
          } catch (e) { if (e.code === 'AUTH') { setToken(null); return null; } throw e; }
        },
        signOut() { setToken(null); }
      },
      async list() {
        let dir;
        try { dir = await gh(repoPath + '/contents/' + DIR + '?ref=' + encodeURIComponent(branch)); }
        catch (e) { if (e.status === 404) return []; throw e; }
        const names = dir.filter(function (f) { return /\.json$/.test(f.name); });
        return Promise.all(names.map(function (f) { return getFile(f.name.replace(/\.json$/, '')); }));
      },
      get: getFile,
      async create(id, data) {
        const r = await gh(filePath(id), { method: 'PUT', body: JSON.stringify({
          message: 'Nová zásilka', content: b64enc(JSON.stringify(data, null, 2) + '\n'), branch: branch }) });
        return { id: id, sha: r.content.sha, data: data };
      },
      async put(id, data, sha, message) {
        const r = await gh(filePath(id), { method: 'PUT', body: JSON.stringify({
          message: message || 'Aktualizace zásilky', content: b64enc(JSON.stringify(data, null, 2) + '\n'), branch: branch, sha: sha }) });
        return { id: id, sha: r.content.sha, data: data };
      },
      async del(id, sha) {
        await gh(filePath(id), { method: 'DELETE', body: JSON.stringify({ message: 'Smazání zásilky', sha: sha, branch: branch }) });
      },
      // Veřejné čtení bez tokenu: obyčejný soubor z GitHub Pages
      async publicGet(id) {
        const url = new URL(DIR + '/' + id + '.json', document.baseURI);
        url.searchParams.set('_', Date.now());
        let res;
        try { res = await fetch(url.href, { cache: 'no-store' }); } catch (e) { throw E('NETWORK', 'Network error'); }
        if (res.status === 404) return null;
        if (!res.ok) throw E('HTTP', 'HTTP ' + res.status, res.status);
        return res.json();
      }
    };
  }

  /* ======================= Úložiště: demo (localStorage) ======================= */
  function demoStore() {
    const KEY = 'trasa-demo-v2';
    const SESSION = 'trasa-demo-admin';
    const wait = function (v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 300); }); };
    const clone = function (o) { return JSON.parse(JSON.stringify(o)); };
    function ago(min) { return new Date(Date.now() - min * 60000).toISOString(); }

    async function load() {
      try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* ignorovat */ }
      const code = 'DEMO-BALI-K123';
      const db = {};
      db[await T.hashCode(code)] = {
        tracking_code: code, status: 'in_transit', description: 'Balík – elektronika', carrier: 'Standardní doprava',
        origin: 'Praha', destination: 'Brno',
        estimated_delivery: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        estimated_delivery_to: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
        recipient: T.maskName('Jana Nováková'), recipient_phone: T.maskPhone('+420 777 123 456'),
        created_at: ago(60 * 30), updated_at: ago(95),
        events: [
          { status: 'in_transit', location: 'Jihlava', note: 'Zásilka opustila třídicí centrum.', at: ago(95) },
          { status: 'received', location: 'Praha', note: 'Převzato dopravcem.', at: ago(60 * 20) },
          { status: 'created', location: 'Praha', note: 'Zásilka byla zaregistrována.', at: ago(60 * 30) }
        ]
      };
      save(db);
      return db;
    }
    function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignorovat */ } }

    return {
      auth: {
        token: function () { return sessionStorage.getItem(SESSION); },
        async signIn() { sessionStorage.setItem(SESSION, '1'); return { email: 'demo režim' }; },
        async session() { return sessionStorage.getItem(SESSION) ? { email: 'demo režim' } : null; },
        signOut() { sessionStorage.removeItem(SESSION); }
      },
      async list() { const db = await load(); return wait(Object.keys(db).map(function (id) { return { id: id, sha: null, data: clone(db[id]) }; })); },
      async get(id) { const db = await load(); if (!db[id]) throw E('HTTP', 'Not found', 404); return { id: id, sha: null, data: clone(db[id]) }; },
      async create(id, data) { const db = await load(); if (db[id]) throw E('HTTP', 'exists', 422); db[id] = clone(data); save(db); return wait({ id: id, sha: null, data: data }); },
      async put(id, data) { const db = await load(); db[id] = clone(data); save(db); return wait({ id: id, sha: null, data: data }); },
      async del(id) { const db = await load(); delete db[id]; save(db); return wait(); },
      async publicGet(id) { const db = await load(); return wait(db[id] ? clone(db[id]) : null); }
    };
  }

  /* ======================= Logika nad úložištěm ======================= */
  const store = isDemo ? demoStore() : githubStore();

  function row(r) { return Object.assign({ id: r.id, sha: r.sha }, r.data); }
  function strip(rec) { const o = Object.assign({}, rec); delete o.id; delete o.sha; return o; }

  // Pole z formuláře → údaje do záznamu (jméno a telefon se zkracují hned zde)
  function fields(d) {
    const out = {
      description: d.description || null, carrier: d.carrier || null,
      origin: d.origin || null, destination: d.destination || null,
      estimated_delivery: d.estimated_delivery || null, estimated_delivery_to: d.estimated_delivery_to || null
    };
    if (d.recipient_name) out.recipient = T.maskName(d.recipient_name);
    if (d.recipient_phone) out.recipient_phone = T.maskPhone(d.recipient_phone) || null;
    return out;
  }

  const admin = {
    getSession: function () { return store.auth.session(); },
    signIn: function (token) { return store.auth.signIn(token); },
    async signOut() { store.auth.signOut(); },

    async list() {
      const rows = await store.list();
      return rows.map(row).sort(function (a, b) { return new Date(b.updated_at) - new Date(a.updated_at); });
    },

    async create(data) {
      const now = new Date().toISOString();
      for (let attempt = 0; attempt < 6; attempt++) {
        const code = T.generateCode();
        const id = await T.hashCode(code);
        const rec = Object.assign({ tracking_code: code, status: 'created', recipient: null, recipient_phone: null }, fields(data), {
          created_at: now, updated_at: now,
          events: [{ status: 'created', location: data.origin || null, note: 'Zásilka byla zaregistrována.', at: now }]
        });
        try { return row(await store.create(id, rec)); }
        catch (e) { if (e.status === 422) continue; throw e; } // kolize kódu → nový kód
      }
      throw E('CODE', 'Nepodařilo se vygenerovat unikátní kód.');
    },

    async addEvent(id, ev) {
      const cur = await store.get(id);
      const now = new Date().toISOString();
      const rec = cur.data;
      rec.events = [{ status: ev.status, location: ev.location || null, note: ev.note || null, at: now }].concat(rec.events || []);
      rec.status = ev.status;
      rec.updated_at = now;
      await store.put(id, rec, cur.sha, 'Stav: ' + ev.status);
    },

    async update(id, data) {
      const cur = await store.get(id);
      await store.put(id, Object.assign(cur.data, fields(data)), cur.sha, 'Úprava údajů zásilky');
    },

    async remove(id) {
      const cur = await store.get(id);
      await store.del(id, cur.sha);
    }
  };

  T.api = {
    async track(code) {
      const id = await T.hashCode(code);
      return store.publicGet(id);
    },
    admin: admin
  };
})();
