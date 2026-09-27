'use strict';
// Test-only PostgREST subset. Never used by the production API.
const http = require('node:http');
function fixtureServer(tables, options = {}) {
  return http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer local-test-token') { res.writeHead(401).end(); return; }
    const url = new URL(req.url, 'http://localhost');
    const table = url.pathname.split('/').pop();
    if (!tables[table]) { res.writeHead(404).end(); return; }
    let rows = tables[table].filter(row => [...url.searchParams].every(([key, value]) => {
      if (['select', 'order', 'offset', 'limit'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(row[key]).toLowerCase() === value.slice(3).toLowerCase();
      if (value.startsWith('ilike.*') && value.endsWith('*')) return String(row[key]).toLowerCase().includes(value.slice(7, -1).toLowerCase());
      return false;
    }));
    const total = rows.length;
    const order = url.searchParams.get('order')?.split('.')[0];
    if (order) rows.sort((a, b) => String(a[order]).localeCompare(String(b[order])));
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Math.min(Number(url.searchParams.get('limit') || 200), options.pageSize || 2);
    rows = rows.slice(offset, offset + limit);
    const fields = url.searchParams.get('select').split(',');
    if (rows.some(row => fields.some(field => !Object.hasOwn(row, field)))) { res.writeHead(400).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': `${rows.length ? `${offset}-${offset + rows.length - 1}` : '*'}/${total}` });
    res.end(JSON.stringify(rows.map(row => Object.fromEntries(fields.map(field => [field, row[field]])))));
  });
}
if (require.main === module) {
  const tables = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
  fixtureServer(tables).listen(Number(process.argv[3] || 3101), '127.0.0.1', () => console.log('Local PostgREST fixture ready'));
}
module.exports = { fixtureServer };
