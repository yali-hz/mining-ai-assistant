'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../app');
const { fixtureServer } = require('./postgrest-fixture');

test('business API integration with paginated PostgREST fixture', async t => {
  const tables = {
    mine: [{ mine_id: 'm-alpha', mine_name: '测试甲矿', mine_area_km2: 42 }, { mine_id: 'm-beta', mine_name: '测试乙矿', mine_area_km2: 9 }],
    production_line: Array.from({ length: 5 }, (_, i) => ({ production_line_id: `p-${i}`, production_line_name: `甲矿生产线${i}`, mine_id: 'm-alpha', design_capacity: i + 10, capacity_unit: '吨/年' })),
    report_upload_record: [{ record_id: 'record-a', report_id: 'r-alpha', object_type: 'mine', object_id: 'm-alpha', mine_id: 'm-alpha', year: 2031, report_type_code: 'custom_report', report_type_name: '自定义年报', status: 'submitted', submitted_at: '2031-03-01', due_date: '2031-04-01', is_overdue: false }, { record_id: 'record-b', report_id: 'r-line', object_type: 'production_line', object_id: 'p-0', mine_id: 'm-alpha', year: 2031, report_type_code: 'custom_report', report_type_name: '自定义年报', status: 'not_submitted', submitted_at: null, due_date: '2031-04-01', is_overdue: false }]
  };
  const upstream = fixtureServer(tables, { pageSize: 1 });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const env = { CLOUDBASE_BASE_URL: `http://127.0.0.1:${upstream.address().port}/rest`, CLOUDBASE_TOKEN: 'local-test-token', NODE_ENV: 'production' };
  const server = createApp(env).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); upstream.closeAllConnections(); upstream.close(); });
  const endpoint = `http://127.0.0.1:${server.address().port}/api/business-query`;
  const base = { entity_type: 'mine', entity_keyword: '测试甲矿', resource_type: 'entity', requested_field: 'mine_area_km2', query_intent: 'attribute' };
  async function post(change = {}, status = 200) {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, ...change }) });
    const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body;
  }
  await t.test('mine attribute and dynamic second mine', async () => { assert.equal((await post()).data.mine_area_km2, 42); assert.equal((await post({ entity_keyword: '测试乙矿' })).data.mine_area_km2, 9); });
  await t.test('line capacity includes unit', async () => { assert.deepEqual((await post({ entity_type: 'production_line', entity_keyword: '甲矿生产线0', requested_field: 'design_capacity' })).data, { design_capacity: 10, unit: '吨/年' }); });
  await t.test('relation count traverses capped pages', async () => { assert.equal((await post({ resource_type: 'relation', requested_field: 'production_line', query_intent: 'count' })).data.count, 5); });
  await t.test('relation list includes all pages', async () => { assert.equal((await post({ resource_type: 'relation', requested_field: 'production_line', query_intent: 'list' })).data.items.length, 5); });
  const report = { resource_type: 'report', requested_field: 'status', query_intent: 'status', year: 2031, report_type_name: '自定义年报' };
  await t.test('mine report excludes line records with same mine_id', async () => { assert.equal((await post(report)).data.status, 'submitted'); });
  await t.test('line report uses object_id', async () => { assert.equal((await post({ ...report, entity_type: 'production_line', entity_keyword: '甲矿生产线0' })).data.status, 'not_submitted'); });
  await t.test('missing yearly record is unknown', async () => { assert.equal((await post({ ...report, year: 2032 })).data.status, 'unknown'); });
  await t.test('missing year rejected', async () => { assert.equal((await post({ ...report, year: null }, 400)).error.code, 'MISSING_YEAR'); });
  await t.test('unknown report name returns unknown', async () => { const data = (await post({ ...report, report_type_name: '不存在的年报' })).data; assert.equal(data.status, 'unknown'); assert.equal(data.record_found, false); assert.equal(data.report_type_code, null); });
  await t.test('duplicate yearly records require clarification', async () => { tables.report_upload_record.push({ ...tables.report_upload_record[0], record_id: 'duplicate' }); try { await post(report, 409); } finally { tables.report_upload_record.pop(); } });
  await t.test('ambiguous entities even with page size one', async () => { assert.equal((await post({ entity_keyword: '测试' }, 409)).error.details.total, 2); });
  await t.test('no matching entity', async () => { await post({ entity_keyword: '不存在' }, 404); });
  await t.test('field injection and wildcard rejected', async () => { await post({ requested_field: '*,manager_phone' }, 400); await post({ entity_keyword: '*' }, 400); });
  await t.test('missing backend config returns structured error', async () => { env.CLOUDBASE_TOKEN = ''; try { await post({}, 503); } finally { env.CLOUDBASE_TOKEN = 'local-test-token'; } });
  await t.test('upstream auth error does not leak credentials', async () => { env.CLOUDBASE_TOKEN = 'secret-invalid-token'; try { const result = await post({}, 502); assert.ok(!JSON.stringify(result).includes('secret-invalid-token')); } finally { env.CLOUDBASE_TOKEN = 'local-test-token'; } });
  await t.test('demo accepts requests without authentication even with a stale key configured', async () => { env.BUSINESS_API_KEY = 'unused-legacy-key'; try { assert.equal((await post()).success, true); } finally { delete env.BUSINESS_API_KEY; } });
  await t.test('malformed JSON', async () => { const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }); assert.equal(r.status, 400); });
});
