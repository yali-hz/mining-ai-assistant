import { Type } from '@earendil-works/pi-ai';
import business from '../server/routes/business-query.js';
import { createBusinessClient, toolResult } from './business-client.mjs';

const entityType = Type.Union(['enterprise', 'mine', 'production_line'].map(value => Type.Literal(value)));
const common = { entity_type: entityType, entity_keyword: Type.String({ minLength: 1, maxLength: 200 }) };

export function createEntityTools(options) {
  const query = createBusinessClient(options);
  return [
    {
      name: 'query_entity', label: '查询对象信息',
      description: `只读查询企业、矿山或生产线的基础信息；只需对象名称，不需要年度。requested_field不填则查基本信息。各对象可查字段：${JSON.stringify(business.ENTITY_FIELDS)}。矿山面积mine_area_km2单位平方公里，生产线产能design_capacity须带返回的unit，不擅自换算。`,
      parameters: Type.Object({ ...common, requested_field: Type.Optional(Type.Union([...new Set(Object.values(business.ENTITY_FIELDS).flat())].map(value => Type.Literal(value)))) }, { additionalProperties: false }),
      async execute(_id, params, signal) {
        if (!params.entity_keyword.trim()) throw Error('请补充对象名称。');
        if (params.requested_field && !business.ENTITY_FIELDS[params.entity_type]?.includes(params.requested_field)) throw Error('该对象不支持此属性，请核对查询内容。');
        const evidence = await query({ ...params, resource_type: 'entity', query_intent: params.requested_field ? 'attribute' : 'profile' }, signal);
        return toolResult(evidence);
      },
    },
    {
      name: 'query_relations', label: '查询关联对象',
      description: '只读查询企业下属矿山/生产线、矿山下属生产线/所属企业、生产线所属矿山/企业；可列出名称或统计数量。只需源对象名称，不需要年度。列表为当前系统登记范围，不能外推为所有实际对象。',
      parameters: Type.Object({ ...common, target_type: entityType, query_intent: Type.Union([Type.Literal('list'), Type.Literal('count')]) }, { additionalProperties: false }),
      async execute(_id, params, signal) {
        if (!params.entity_keyword.trim()) throw Error('请补充对象名称。');
        if (!business.RELATIONS[params.entity_type]?.[params.target_type]) throw Error('不支持该对象关系，请核对源对象和目标类型。');
        const evidence = await query({ ...params, resource_type: 'relation', requested_field: params.target_type }, signal);
        if (!Number.isInteger(evidence.data.count) || evidence.data.count < 0 || (params.query_intent === 'list' && (!Array.isArray(evidence.data.items) || evidence.data.items.length !== evidence.data.count))) throw Error('关系查询响应不完整，无法确认关联数量。');
        return toolResult(evidence);
      },
    },
  ];
}
