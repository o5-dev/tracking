/*
 * Minimální lokální server pro náhled webu (bez závislostí).
 * Spuštění:  npm run dev      (port změníte přes PORT=3000)
 * Pro nasazení na GitHub Pages se nepoužívá.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};
// Co se nikdy nesmí servírovat (a co do webu nepatří)
const HIDDEN = /^\/(\.git|\.claude|node_modules|scripts|test)(\/|$)/;

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

http.createServer(function (req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch (e) { return send(res, 400, 'Bad request'); }

  if (HIDDEN.test(pathname)) return send(res, 404, 'Not found');
  let file = path.join(ROOT, pathname);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');

  fs.stat(file, function (err, st) {
    if (!err && st.isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(301, { Location: pathname + '/' }); return res.end(); }
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, function (e, buf) {
      if (e) return send(res, 404, 'Not found');
      send(res, 200, buf, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    });
  });
}).listen(PORT, function () {
  console.log('Web běží na http://localhost:' + PORT + '/   (správa: /admin/)');
});
