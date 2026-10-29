export const INSUFFICIENT = '当前检索材料不足以确认这个问题，无法提供有依据的结论。请补充相应的报送指南或材料要求。';
export function isKnowledgePayload(text) {
  return typeof text === 'string' && /["'](?:status|quotes)["']\s*:/.test(text) && /supported|insufficient|quotes/.test(text);
}
export function groundKnowledgeAnswer(answer, results, question = '') {
  const documents = results.flatMap(result => result.matches || []);
  // Only recover simple deadline questions from explicit source sentences.
  // Never infer dates, resolve conflicting rules, or answer materials with a deadline.
  const types = ['储量年报', '卤水监测年报', '年度开发利用报告', '国情调查报告'].filter(type => question.includes(type));
  if (types.length === 1 && /什么时候|何时|最晚|截止|[一二三四五六七八九十\d]+月.*[交报]/.test(question) && !/材料|准备|例外|特殊|最新|新规|变更|修改|地区|省|逾期|是否提交|交了吗|以及|另外/.test(question)) {
    const quotes = documents.flatMap(doc => [...doc.content.matchAll(new RegExp(`${types[0]}应于[^。\\n]{1,60}(?:报送|提交)[^。\\n]*。`, 'g'))].map(match => ({ source: doc.source, text: match[0] })));
    if (quotes.length && new Set(quotes.map(q => q.text)).size === 1) {
      const q = quotes[0];
      return `按项目虚拟测试规则，报送时间以以下原文为准：\n\n“${q.text}”\n来源：${q.source}\n\n以上为项目演示规则，不代表现实监管要求。`;
    }
  }
  let parsed;
  try { parsed = JSON.parse(answer.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1')); } catch { return INSUFFICIENT; }
  if (parsed.status !== 'supported' || !Array.isArray(parsed.quotes) || !parsed.quotes.length || parsed.quotes.length > 5) return INSUFFICIENT;
  const quotes = parsed.quotes;
  if (quotes.some(q => typeof q.text !== 'string' || q.text.trim().length < 10 || !documents.some(doc => doc.source === q.source && doc.content.includes(q.text)))) return INSUFFICIENT;
  // Render only validated verbatim evidence. Never render the model's additional prose.
  return '依据项目虚拟测试规则，检索到以下原文（不代表现实监管要求）：\n\n' + quotes.map(q => `“${q.text}”\n来源：${q.source}`).join('\n\n');
}
