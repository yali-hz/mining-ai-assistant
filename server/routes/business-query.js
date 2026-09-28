'use strict';

const { Router } = require('express');

// ===============================
// Entity 字段白名单（对齐真实数据表字段）
// ===============================

const ENTITY_FIELDS = {

  enterprise: [
    'enterprise_name',
    'credit_code',
    'enterprise_type',
    'enterprise_stage',
    'business_status',
    'legal_representative',
    'registered_address',
    'parent_enterprise_name',
    'region_code'
  ],

  mine: [
    'mine_name',
    'mine_area_km2',
    'mine_scale',
    'production_scale',
    'production_scale_unit',
    'development_status',
    'mining_methods',
    'mineral_types',
    'mining_license_no',
    'valid_from',
    'valid_to',
    'mine_address',
    'green_mine_level',
    'issuing_level',
    'operator_enterprise_name',
    'mining_right_holder_name',
    'mineral_area_name',
    'mining_range_type'
  ],

  production_line: [
    'production_line_name',
    'design_capacity',
    'capacity_unit',
    'production_process',
    'product_types',
    'production_start_date',
    'production_end_date'
  ]

};

// ===============================
// 关系配置（双向）
//   forward: 外键在目标表上 → 目标表 where 外键 = 源实体id   （1:N）
//   reverse: 外键在源表上   → 先读源行取外键值，再按目标表主键查（N:1）
// ===============================

const RELATIONS = {

  enterprise: {

    mine: {
      mode: 'forward',
      table: 'mine',
      foreignKey: 'enterprise_id',
      idField: 'mine_id',
      nameField: 'mine_name',
      cardinality: '1:N'
    },

    production_line: {
      mode: 'forward',
      table: 'production_line',
      foreignKey: 'enterprise_id',
      idField: 'production_line_id',
      nameField: 'production_line_name',
      cardinality: '1:N'
    }

  },

  mine: {

    production_line: {
      mode: 'forward',
      table: 'production_line',
      foreignKey: 'mine_id',
      idField: 'production_line_id',
      nameField: 'production_line_name',
      cardinality: '1:N'
    },

    // ★ 反向：先取 mine.enterprise_id，再查 enterprise 表
    enterprise: {
      mode: 'reverse',
      table: 'enterprise',
      sourceKey: 'enterprise_id',
      idField: 'enterprise_id',
      nameField: 'enterprise_name',
      cardinality: 'N:1'
    }

  },

  production_line: {

    // ★ 反向：先取 production_line.mine_id，再查 mine 表
    mine: {
      mode: 'reverse',
      table: 'mine',
      sourceKey: 'mine_id',
      idField: 'mine_id',
      nameField: 'mine_name',
      cardinality: 'N:1'
    },

    // ★ 反向：先取 production_line.enterprise_id，再查 enterprise 表
    enterprise: {
      mode: 'reverse',
      table: 'enterprise',
      sourceKey: 'enterprise_id',
      idField: 'enterprise_id',
      nameField: 'enterprise_name',
      cardinality: 'N:1'
    }

  }

};

const REPORT_TABLE = 'report_upload_record';
const REPORT_FIELDS = 'status,submitted_at,due_date,is_overdue';

class QueryError extends Error {

  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }

}

const fail = (status, code, message, details) => {
  throw new QueryError(status, code, message, details);
};

function text(value, name) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 200 ||
    /[\x00-\x1f]/.test(value)
  ) {
    fail(400, 'INVALID_PARAMETER', `${name} 必须是非空字符串，最长200字符`);
  }
  return value.trim();
}

/** year：接受整数或纯数字字符串（2024 / "2024" / "2024年"），其余 MISSING_YEAR */
function normalizeYear(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;

  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4})\s*年?$/);
    if (m) return Number(m[1]);
  }

  fail(400, 'MISSING_YEAR', '请提供明确的整数报告年度');
}

// ===============================
// 参数校验
// ===============================

function validate(body) {

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail(400, 'INVALID_PARAMETER', '请求体必须是JSON对象');
  }

  const p = { ...body };

  if (!Object.hasOwn(ENTITY_FIELDS, p.entity_type)) {
    fail(400, 'INVALID_PARAMETER', 'entity_type 仅支持 enterprise / mine / production_line');
  }

  p.entity_keyword = text(p.entity_keyword, 'entity_keyword');

  if (p.resource_type === 'entity') {

    if (!['attribute', 'profile'].includes(p.query_intent)) {
      fail(400, 'UNSUPPORTED_QUERY', '实体查询仅支持 attribute/profile');
    }

    if (
      p.query_intent === 'attribute' &&
      !ENTITY_FIELDS[p.entity_type].includes(p.requested_field)
    ) {
      fail(400, 'UNSUPPORTED_QUERY', '属性字段不支持');
    }

  }

  else if (p.resource_type === 'relation') {

    // 兼容两种写法：优先 target_type，其次用 requested_field 作为目标类型
    const targetType = p.target_type || p.requested_field;

    if (!RELATIONS[p.entity_type] || !RELATIONS[p.entity_type][targetType]) {
      const supported = Object.keys(RELATIONS[p.entity_type] || {}).join(' / ');
      fail(400, 'UNSUPPORTED_QUERY', `不支持该实体关系，当前支持：${supported}`);
    }

    p.target_type = targetType;

    if (!['list', 'count'].includes(p.query_intent)) {
      fail(400, 'UNSUPPORTED_QUERY', '关系查询仅支持list/count');
    }

  }

  else if (p.resource_type === 'report') {

    if (p.query_intent !== 'status') {
      fail(400, 'UNSUPPORTED_QUERY', '报告查询仅支持status');
    }

    // requested_field 可选，缺省按 status 处理
    if (p.requested_field === undefined || p.requested_field === null || p.requested_field === '') {
      p.requested_field = 'status';
    }

    if (!['status', 'submitted_at', 'due_date'].includes(p.requested_field)) {
      fail(400, 'UNSUPPORTED_QUERY', '报告查询仅支持 status / submitted_at / due_date 字段');
    }

    p.year = normalizeYear(p.year);

    p.report_type_name = text(p.report_type_name, 'report_type_name');

  }

  else {
    fail(400, 'UNSUPPORTED_QUERY', 'resource_type 仅支持 entity/relation/report');
  }

  return p;
}

// ===============================
// CloudBase Client
// ===============================

function createClient(env, fetchImpl, signal) {

  let base;

  try {
    base = new URL(env.CLOUDBASE_BASE_URL);
  } catch {}

  const token = env.CLOUDBASE_TOKEN || env.CLOUDBASE_API_TOKEN;

  if (!base || !token) {
    fail(503, 'CLOUDBASE_NOT_CONFIGURED', '请配置CLOUDBASE_BASE_URL和TOKEN');
  }

  return async function read(table, params) {

    const url = new URL(`${base.href.replace(/\/$/, '')}/${table}`);

    Object.entries(params).forEach(([k, v]) => {
      url.searchParams.set(k, String(v));
    });

    const response = await fetchImpl(url, {
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      fail(502, 'CLOUDBASE_ERROR', 'CloudBase查询失败');
    }

    return await response.json();
  };
}

// ===============================
// Router
// ===============================

function createBusinessRouter(env, fetchImpl) {

  const router = Router();

  router.post('/', async (req, res) => {

    try {

      const p = validate(req.body);

      const read = createClient(env, fetchImpl, AbortSignal.timeout(15000));

      const idField = `${p.entity_type}_id`;
      const nameField = `${p.entity_type}_name`;

      // 1) 定位实体
      const entityRows = await read(p.entity_type, {
        select: `${idField},${nameField}`,
        [nameField]: `ilike.*${p.entity_keyword}*`
      });

      if (!entityRows.length) {
        fail(404, 'ENTITY_NOT_FOUND', '未找到匹配实体');
      }

      const row = entityRows[0];

      const entity = {
        type: p.entity_type,
        id: row[idField],
        name: row[nameField]
      };

      let data;

      // ---------- entity ----------
      if (p.resource_type === 'entity') {

        if (p.query_intent === 'profile') {

          const fields = ENTITY_FIELDS[p.entity_type];

          const rows = await read(p.entity_type, {
            select: fields.join(','),
            [nameField]: `eq.${entity.name}`
          });

          data = rows[0] || {};

        } else {

          const rows = await read(p.entity_type, {
            select: p.requested_field,
            [nameField]: `eq.${entity.name}`
          });

          data = {
            [p.requested_field]: rows[0]?.[p.requested_field] ?? null
          };

        }

      }

      // ---------- relation ----------
      else if (p.resource_type === 'relation') {

        const relation = RELATIONS[p.entity_type][p.target_type];

        let rows = [];

        if (relation.mode === 'forward') {

          // 1:N：外键在目标表
          rows = await read(relation.table, {
            select: `${relation.idField},${relation.nameField}`,
            [relation.foreignKey]: `eq.${entity.id}`
          });

        } else {

          // ★ N:1 反向：先读源实体行的外键值，再按目标表主键查询
          const srcRows = await read(p.entity_type, {
            select: relation.sourceKey,
            [idField]: `eq.${entity.id}`
          });

          const fkValue = srcRows[0]?.[relation.sourceKey];

          if (fkValue) {
            rows = await read(relation.table, {
              select: `${relation.idField},${relation.nameField}`,
              [relation.idField]: `eq.${fkValue}`
            });
          }

        }

        data = p.query_intent === 'count'
          ? {
              count: rows.length,
              relation: `${p.entity_type} → ${p.target_type}`,
              cardinality: relation.cardinality
            }
          : {
              count: rows.length,
              relation: `${p.entity_type} → ${p.target_type}`,
              cardinality: relation.cardinality,
              items: rows
            };

      }

      // ---------- report ----------
      else {

        const query = {
          select: `record_id,year,report_type_name,${REPORT_FIELDS}`,
          object_type: `eq.${entity.type}`,
          object_id: `eq.${entity.id}`,
          year: `eq.${p.year}`,
          report_type_name: `eq.${p.report_type_name}`
        };

        let records = await read(REPORT_TABLE, query);

        // 精确匹配不到时，退化为模糊匹配（兼容"年报"→"储量年报"）
        if (!records.length) {
          records = await read(REPORT_TABLE, {
            ...query,
            report_type_name: `ilike.*${p.report_type_name}*`
          });
        }

        const rec = records[0];

        let isOverdue = rec?.is_overdue ?? null;

        // is_overdue 缺失时按 due_date / submitted_at 计算
        if (isOverdue === null && rec?.due_date) {
          if (rec.submitted_at) {
            isOverdue = new Date(rec.submitted_at) > new Date(rec.due_date);
          } else {
            isOverdue = new Date(rec.due_date) < new Date();
          }
        }

        let message;
        if (!rec) {
          message = '未找到该年度记录，不能据此判定未提交';
        } else if (isOverdue === true) {
          message = '报告已逾期';
        } else if (rec.submitted_at) {
          message = '报告已按时提交';
        } else {
          message = '报告尚未提交，仍在有效期内';
        }

        data = {
          year: p.year,
          report_type_name: p.report_type_name,
          record_found: !!rec,
          status: rec?.status ?? 'unknown',
          submitted_at: rec?.submitted_at ?? null,
          due_date: rec?.due_date ?? null,
          is_overdue: isOverdue,
          message
        };

      }

      res.json({ success: true, entity, data });

    }

    catch (err) {

      const known = err instanceof QueryError;

      res.status(known ? err.status : 500).json({
        success: false,
        error: {
          code: known ? err.code : 'INTERNAL_ERROR',
          message: known ? err.message : '服务内部错误'
        }
      });

    }

  });

  return router;
}

module.exports = { createBusinessRouter, ENTITY_FIELDS, RELATIONS, validate };
