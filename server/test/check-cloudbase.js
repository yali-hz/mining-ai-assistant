'use strict';
// Read-only diagnostics; no credentials, URLs or row data are printed.
const { loadEnvFile } = require('node:process');
const path = require('node:path');
try { loadEnvFile(path.resolve(__dirname, '../../.env')); }
catch (err) { if (err.code !== 'ENOENT') throw err; }
const token = process.env.CLOUDBASE_TOKEN;
const base = process.env.CLOUDBASE_BASE_URL;
function clean(value) {
  if (typeof value !== 'string') return undefined;
  return value.split(token).join('[REDACTED]').replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').slice(0, 600);
}
async function probe(label, table, params) {
  const url = new URL(`${base.replace(/\/$/, '')}/${table}`);
  for (const [key, value] of Object.entries({ ...params, limit: 1 })) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'count=exact', Accept: 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
  const body = await response.json().catch(() => null);
  console.log(JSON.stringify({ test: label, table, status: response.status, rows: Array.isArray(body) ? body.length : undefined, code: clean(body?.code), message: clean(body?.message), hint: clean(body?.hint) }, null, 2));
  return response.ok && Array.isArray(body) ? body : null;
}
async function main() {
  if (!token || !base) throw new Error('CONFIG_MISSING');
  await probe('report table access', 'report', { select: 'report_id' });
  await probe('upload table access', 'report_upload_record', { select: 'record_id' });
  const mines = await probe('resolve mine', 'mine', { select: 'mine_id', mine_name: 'eq.察尔汗一号盐湖矿山' });
  if (!mines?.length) return;
  const scope = { object_type: 'eq.mine', object_id: `eq.${mines[0].mine_id}` };
  const definitions = await probe('annual report definition (same filters as API)', 'report', { ...scope, select: 'report_id,report_type_code,report_type_name', report_type_name: 'eq.储量年报', is_annual: 'eq.true', enabled: 'eq.true', order: 'report_id.asc' });
  const params = { ...scope, select: 'record_id,report_id,year,report_type_code,report_type_name,status,submitted_at,due_date,is_overdue', year: 'eq.2026', order: 'record_id.asc' };
  if (definitions?.length) {
    params.report_id = `eq.${definitions[0].report_id}`;
    params.report_type_code = `eq.${definitions[0].report_type_code}`;
  }
  await probe('annual upload record', 'report_upload_record', params);
}
main().catch(err => { console.error(JSON.stringify({ error: 'Diagnostic could not finish', code: err.cause?.code || err.code || err.name })); process.exitCode = 1; });
