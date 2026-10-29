import { createReportTool, REPORT_PARAMETERS } from './report-tool.mjs';
import { toolResult } from './business-client.mjs';

export const RULE_SOURCE = '年度报告逾期与补报规则（项目虚拟测试规则）';

// A date-only deadline includes that whole day in China Standard Time.
export function parseBusinessDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);
  const parts = match || iso;
  if (!parts) return null;
  const [year, month, day] = parts.slice(1, 4).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  const timestamp = Date.parse(match ? `${value}T23:59:59.999+08:00` : value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function assessReport(data, now = Date.now()) {
  const result = (decision, conclusion, reason) => ({ decision, conclusion, reason, rule_source: RULE_SOURCE, evaluated_at: new Date(now).toISOString(), timezone: 'Asia/Shanghai', scope: '仅判断该对象该年度该类报告，不代表整体合规或审批结果' });
  const unknown = reason => result('unknown', '无法判断', reason);
  if (data.record_found !== true) return unknown('未找到登记记录，不能据此判定未提交或存在风险');
  const due = parseBusinessDate(data.due_date);
  if (due === null) return unknown('截止日期缺失或无效，不能计算是否逾期');
  let decision;
  if (data.submitted_at) {
    const submitted = parseBusinessDate(data.submitted_at);
    if (submitted === null) return unknown('提交日期无效，不能计算是否逾期');
    const dateOnly = data.submitted_at.length === 10;
    const submittedStart = dateOnly ? submitted - 86_400_000 + 1 : submitted;
    if (submittedStart > now) return unknown('提交日期晚于当前时间，需核对数据');
    if (dateOnly && submittedStart <= due && submitted > due) return unknown('提交日期只有日精度，无法确定当天提交时间与截止时刻的先后');
    if (!['submitted', 'late_submitted'].includes(data.status)) return unknown('提交日期与报告状态不一致，需核对数据');
    decision = submitted <= due ? 'submitted_on_time' : 'late_submitted';
  } else {
    if (!['not_submitted', 'overdue'].includes(data.status)) return unknown('提交状态或日期不完整，不能确认是否已提交');
    decision = now <= due ? 'pending' : 'overdue_not_submitted';
  }
  const names = { submitted_on_time: '已按时提交', late_submitted: '已逾期补交', pending: '尚未提交，但未逾期', overdue_not_submitted: '已逾期未提交' };
  const verdict = result(decision, names[decision], data.submitted_at ? '按实际提交时间与截止时间比较' : '按系统登记的未提交状态及当前时间与截止时间比较');
  if (typeof data.is_overdue === 'boolean' && data.is_overdue !== ['late_submitted', 'overdue_not_submitted'].includes(decision)) verdict.warning = '系统存储的逾期标记与日期计算不一致，本结论按日期计算，需核对登记数据';
  return verdict;
}

export function createDeadlineTool(options) {
  const report = createReportTool(options);
  return {
    name: 'check_report_deadline', label: '核对报告逾期规则',
    description: '判断指定对象、年度和报告类型是否逾期。工具会自行查询真实记录再执行确定性规则，不接收模型编造的状态或日期。区分按时提交、逾期补交、尚未到期未提交、逾期未提交；缺记录/缺日期不能判断。不代表整体风险等级。',
    parameters: REPORT_PARAMETERS,
    async execute(id, params, signal) {
      const result = await report.execute(id, params, signal);
      const evidence = result.details;
      const { message, ...facts } = evidence.data;
      return toolResult({ ...evidence, data: facts, assessment: assessReport(facts, options.now?.() ?? Date.now()) });
    },
  };
}
