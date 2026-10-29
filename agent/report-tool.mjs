import { Type } from '@earendil-works/pi-ai';
import { createBusinessClient, toolResult } from './business-client.mjs';

export const REPORT_PARAMETERS = Type.Object({
  entity_type: Type.Union([Type.Literal('mine'), Type.Literal('production_line')]),
  entity_keyword: Type.String({ minLength: 1, maxLength: 200 }),
  year: Type.Integer({ minimum: 1900, maximum: 2100 }),
  report_type_name: Type.String({ minLength: 1, maxLength: 100 }),
}, { additionalProperties: false });

export function createReportTool({ baseUrl, fetchImpl = fetch }) {
  const query = createBusinessClient({ baseUrl, fetchImpl });
  return {
    name: 'query_report_status',
    label: '查询年度报告',
    description: '只读查询指定矿山或生产线某年度某类报告的提交记录。必须由用户明确提供对象、报告年度和报告类型；无记录不等于未提交。',
    parameters: REPORT_PARAMETERS,
    async execute(_id, params, signal) {
      if (!params.entity_keyword.trim() || !params.report_type_name.trim()) throw new Error('请补充对象名称和报告类型。');
      const result = await query({ ...params, resource_type: 'report', query_intent: 'status', requested_field: 'status' }, signal);
      if (!result.entity || !result.data || typeof result.data.record_found !== 'boolean') {
        throw new Error('业务响应格式不完整，无法判断报告状态。');
      }
      if (result.data.record_found && result.data.year !== undefined && result.data.year !== params.year) throw Error('查询返回年度与所查年度不一致，无法判断报告状态。');
      return toolResult(result);
    },
  };
}
