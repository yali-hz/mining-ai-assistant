import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntityTools } from './entity-tools.mjs';
import { assessReport, createDeadlineTool, parseBusinessDate } from './rule-tool.mjs';

const now = Date.parse('2025-04-02T10:00:00+08:00');
const base = { record_found: true, due_date: '2025-03-31', submitted_at: '2025-03-24T10:00:00+08:00', status: 'submitted' };

test('rule distinguishes all four outcomes and unknown records', () => {
  assert.equal(assessReport(base, now).decision, 'submitted_on_time');
  assert.equal(assessReport({ ...base, submitted_at: '2025-04-01T00:00:00+08:00', status: 'late_submitted' }, now).decision, 'late_submitted');
  assert.equal(assessReport({ ...base, submitted_at: null, status: 'not_submitted' }, now).decision, 'overdue_not_submitted');
  assert.equal(assessReport({ ...base, submitted_at: null, status: 'not_submitted' }, Date.parse('2025-03-31T23:59:59+08:00')).decision, 'pending');
  assert.equal(assessReport({ record_found: false }, now).decision, 'unknown');
});

test('date-only deadline includes the whole China Standard Time day', () => {
  assert.equal(parseBusinessDate('2025-03-31'), Date.parse('2025-03-31T23:59:59.999+08:00'));
  assert.equal(assessReport({ ...base, submitted_at: '2025-03-31T23:59:59+08:00' }, now).decision, 'submitted_on_time');
  assert.equal(assessReport({ ...base, submitted_at: '2025-04-01T00:00:00+08:00' }, now).decision, 'late_submitted');
  assert.equal(assessReport({ ...base, submitted_at: '2025-03-31' }, Date.parse('2025-03-31T12:00:00+08:00')).decision, 'submitted_on_time');
});

test('invalid, missing, future and insufficient-precision dates remain unknown', () => {
  for (const value of ['2025-02-30', '2025-02-30T12:00:00+08:00', '2025-13-01', '2025-03-31T25:00:00+08:00', 'not-a-date', '2025-03-31T12:00:00']) assert.equal(parseBusinessDate(value), null);
  assert.equal(parseBusinessDate('2024-02-29') !== null, true);
  for (const change of [{ due_date: null }, { due_date: 'invalid' }, { submitted_at: 'invalid' }, { submitted_at: null, status: 'submitted' }, { submitted_at: '2027-01-01T00:00:00Z' }, { status: 'not_submitted' }, { submitted_at: '2025-03-31', due_date: '2025-03-31T12:00:00+08:00' }]) assert.equal(assessReport({ ...base, ...change }, now).decision, 'unknown');
});

test('date calculation reports conflict with stored overdue flag', () => {
  const assessment = assessReport({ ...base, is_overdue: true }, now);
  assert.equal(assessment.decision, 'submitted_on_time'); assert.match(assessment.warning, /不一致/);
});

test('rule tool fetches authoritative record rather than accepting model dates', async () => {
  let payload;
  const tool = createDeadlineTool({ baseUrl: 'http://localhost:3000', now: () => now, fetchImpl: async (_url, options) => {
    payload = JSON.parse(options.body);
    return Response.json({ success: true, entity: { type: 'mine', name: '甲矿' }, data: { ...base, year: 2024 } });
  } });
  const result = await tool.execute('rule', { entity_type: 'mine', entity_keyword: '甲矿', year: 2024, report_type_name: '储量年报' });
  assert.equal(payload.resource_type, 'report');
  assert.equal(result.details.assessment.decision, 'submitted_on_time');
  assert.match(result.details.assessment.rule_source, /虚拟/);
});

test('entity tool supports fields and profiles; rejects wrong-object fields before fetch', async () => {
  const payloads = [];
  const [tool] = createEntityTools({ baseUrl: 'http://localhost:3000', fetchImpl: async (_url, options) => {
    payloads.push(JSON.parse(options.body));
    return Response.json({ success: true, entity: {}, data: { mine_area_km2: 42 } });
  } });
  const args = { entity_type: 'mine', entity_keyword: '甲矿' };
  assert.equal((await tool.execute('field', { ...args, requested_field: 'mine_area_km2' })).details.data.mine_area_km2, 42);
  await tool.execute('profile', args);
  assert.deepEqual(payloads.map(p => p.query_intent), ['attribute', 'profile']);
  assert.ok(payloads.every(p => p.year === undefined));
  await assert.rejects(tool.execute('wrong', { ...args, requested_field: 'design_capacity' }), /不支持/);
  assert.equal(payloads.length, 2);
});

test('relations preserve list/count and reject invalid relation or incomplete list', async () => {
  let broken = false;
  const [, tool] = createEntityTools({ baseUrl: 'http://localhost:3000', fetchImpl: async (_url, options) => {
    const params = JSON.parse(options.body);
    return Response.json({ success: true, entity: {}, data: params.query_intent === 'list' ? { count: 2, items: broken ? [] : [{ name: '甲线' }, { name: '乙线' }] } : { count: 2 } });
  } });
  const args = { entity_type: 'mine', entity_keyword: '甲矿', target_type: 'production_line' };
  assert.equal((await tool.execute('list', { ...args, query_intent: 'list' })).details.data.items.length, 2);
  assert.equal((await tool.execute('count', { ...args, query_intent: 'count' })).details.data.count, 2);
  await assert.rejects(tool.execute('bad', { ...args, target_type: 'mine', query_intent: 'list' }), /不支持/);
  broken = true;
  await assert.rejects(tool.execute('bad-list', { ...args, query_intent: 'list' }), /不完整/);
});
