'use strict';
const { Router } = require('express');

// Only these fields can be selected. User input never supplies tables or SQL.
const FIELDS = {
  mine: ['mine_name', 'mine_area_km2', 'mine_scale', 'production_scale', 'production_scale_unit', 'development_status', 'mining_methods', 'mineral_types', 'mining_license_no', 'valid_from', 'valid_to'],
  production_line: ['production_line_name', 'design_capacity', 'capacity_unit', 'production_process', 'product_types', 'production_start_date', 'production_end_date']
};
class QueryError extends Error {
  constructor(status, code, message, details) { super(message); Object.assign(this, { status, code, details }); }
}
const fail = (status, code, message, details) => { throw new QueryError(status, code, message, details); };
function text(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\x00-\x1f]/.test(value)) fail(400, 'INVALID_PARAMETER', `${name} 必须是非空字符串，最长 200 字符`);
  return value.trim();
}
function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'INVALID_PARAMETER', '请求体必须是 JSON 对象');
  const p = { ...body };
  if (!Object.hasOwn(FIELDS, p.entity_type)) fail(400, 'INVALID_PARAMETER', 'entity_type 仅支持 mine / production_line');
  p.entity_keyword = text(p.entity_keyword, 'entity_keyword');
  if (p.resource_type === 'entity') {
    if (p.query_intent !== 'attribute' || !FIELDS[p.entity_type].includes(p.requested_field)) fail(400, 'UNSUPPORTED_QUERY', '属性查询字段或意图不支持');
  } else if (p.resource_type === 'relation') {
    if (p.entity_type !== 'mine' || p.requested_field !== 'production_line' || !['list', 'count'].includes(p.query_intent)) fail(400, 'UNSUPPORTED_QUERY', '关系查询仅支持 mine → production_line 的 list / count');
  } else if (p.resource_type === 'report') {
    if (p.query_intent !== 'status' || !['status', 'submitted_at', 'due_date'].includes(p.requested_field)) fail(400, 'UNSUPPORTED_QUERY', '报告查询仅支持 status 意图及 status / submitted_at / due_date 字段');
    if (!Number.isInteger(p.year) || p.year < 1 || p.year > 9999) fail(400, 'MISSING_YEAR', '请提供明确的整数报告年度');
    p.report_type_name = text(p.report_type_name, 'report_type_name');
  } else fail(400, 'UNSUPPORTED_QUERY', 'resource_type 仅支持 entity / relation / report');
  return p;
}

function createClient(env, fetchImpl, signal) {
  let base;
  try { base = new URL(env.CLOUDBASE_BASE_URL); } catch { /* handled below */ }
  if (!base || !env.CLOUDBASE_TOKEN || base.search || base.hash || base.username || base.password ||
      !(base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))) {
    fail(503, 'CLOUDBASE_NOT_CONFIGURED', '请在服务端配置 CLOUDBASE_BASE_URL 和 CLOUDBASE_TOKEN');
  }
  // Fetch every page: PostgREST may cap results even when no limit is requested.
  return async function read(table, params) {
    const rows = [];
    let total;
    do {
      const url = new URL(`${base.href.replace(/\/$/, '')}/${table}`);
      for (const [key, value] of Object.entries({ ...params, limit: 200, offset: rows.length })) url.searchParams.set(key, String(value));
      let response, page;
      try {
        response = await fetchImpl(url, { headers: { Authorization: `Bearer ${env.CLOUDBASE_TOKEN}`, Accept: 'application/json', Prefer: 'count=exact' }, signal, redirect: 'error' });
        if (!response.ok) fail(502, 'CLOUDBASE_ERROR', 'CloudBase 查询失败，请检查表结构、Token 和 SELECT 权限');
        page = await response.json();
      } catch (err) {
        if (err instanceof QueryError) throw err;
        fail(signal.aborted ? 504 : 502, signal.aborted ? 'CLOUDBASE_TIMEOUT' : 'CLOUDBASE_ERROR', signal.aborted ? 'CloudBase 查询超时' : 'CloudBase 连接或响应异常');
      }
      const count = response.headers.get('content-range')?.match(/\/(\d+)$/);
      if (!Array.isArray(page) || page.some(row => !row || typeof row !== 'object' || Array.isArray(row)) || !count) fail(502, 'INVALID_UPSTREAM_RESPONSE', 'CloudBase 未返回有效列表及精确总数');
      total = Number(count[1]);
      if (total > 10000) fail(422, 'RESULT_TOO_LARGE', '结果过多，请缩小查询范围');
      if (!page.length && rows.length < total) fail(502, 'INCOMPLETE_UPSTREAM_RESPONSE', 'CloudBase 分页结果不完整');
      rows.push(...page);
    } while (rows.length < total);
    return rows;
  };
}

function createBusinessRouter(env, fetchImpl) {
  const router = Router();
  router.post('/', async (req, res) => {
    try {
      const p = validate(req.body);
      const read = createClient(env, fetchImpl, AbortSignal.timeout(15000));
      const id = `${p.entity_type}_id`, name = `${p.entity_type}_name`;
      const select = [...new Set([id, name, ...(p.resource_type === 'entity' ? [p.requested_field] : [])])];
      if (p.requested_field === 'design_capacity') select.push('capacity_unit');
      if (p.requested_field === 'production_scale') select.push('production_scale_unit');
      const params = { select: select.join(','), order: `${id}.asc` };
      let matches = await read(p.entity_type, { ...params, [name]: `eq.${p.entity_keyword}` });
      if (!matches.length) {
        // Reject wildcard/filter syntax instead of allowing broad accidental matches.
        if (/[*%_\\"(),]/.test(p.entity_keyword)) fail(400, 'INVALID_KEYWORD', '模糊查询关键词不能包含通配符或过滤语法');
        matches = await read(p.entity_type, { ...params, [name]: `ilike.*${p.entity_keyword}*` });
      }
      if (!matches.length) fail(404, 'ENTITY_NOT_FOUND', '未找到匹配实体');
      if (matches.length > 1) fail(409, 'AMBIGUOUS_ENTITY', '匹配多个实体，请使用完整名称', { candidates: matches.slice(0, 20).map(row => ({ id: row[id], name: row[name] })), total: matches.length });
      const row = matches[0];
      const entity = { type: p.entity_type, id: row[id], name: row[name] };
      let data;
      if (p.resource_type === 'entity') {
        data = { [p.requested_field]: row[p.requested_field] ?? null };
        if (p.requested_field === 'mine_area_km2') data.unit = 'km²';
        if (p.requested_field === 'design_capacity') data.unit = row.capacity_unit ?? null;
        if (p.requested_field === 'production_scale') data.unit = row.production_scale_unit ?? null;
      } else if (p.resource_type === 'relation') {
        const lines = await read('production_line', { select: 'production_line_id,production_line_name', mine_id: `eq.${entity.id}`, order: 'production_line_id.asc' });
        data = p.query_intent === 'count' ? { count: lines.length } : { count: lines.length, items: lines };
      } else {
        const scope = { object_type: `eq.${entity.type}`, object_id: `eq.${entity.id}` };
        const records = await read('report_upload_record', { ...scope, select: 'record_id,report_id,year,report_type_code,report_type_name,status,submitted_at,due_date,is_overdue', report_type_name: `eq.${p.report_type_name}`, year: `eq.${p.year}`, order: 'record_id.asc' });
        if (records.length > 1) fail(409, 'MULTIPLE_REPORT_RECORDS', '该年度存在多条报告记录，无法确定唯一状态');
        data = { year: p.year, report_type_name: records[0]?.report_type_name ?? p.report_type_name, report_type_code: records[0]?.report_type_code ?? null, record_found: records.length === 1, status: records[0]?.status ?? 'unknown', submitted_at: records[0]?.submitted_at ?? null, due_date: records[0]?.due_date ?? null, is_overdue: records[0]?.is_overdue ?? null };
        if (!records.length) data.message = '未找到该年度记录，不能据此判定未提交';
      }
      res.json({ success: true, entity, data });
    } catch (err) {
      const known = err instanceof QueryError;
      res.status(known ? err.status : 500).json({ success: false, error: { code: known ? err.code : 'INTERNAL_ERROR', message: known ? err.message : '服务内部错误', ...(known && err.details ? { details: err.details } : {}) } });
    }
  });
  return router;
}
module.exports = { createBusinessRouter };
