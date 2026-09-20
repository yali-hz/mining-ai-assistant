import { randomUUID } from 'node:crypto';
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
export async function handleChat(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: '请使用 POST 提交问题。' });
  if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: '请求格式不正确。' });
  let question;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) return json(res, 413, { error: '问题过长，请缩短后重试。' });
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    question = typeof input?.question === 'string' ? input.question.trim() : '';
    if (!question || question.length > 1000) return json(res, 400, { error: '请输入 1–1000 字的问题。' });
  } catch { return json(res, 400, { error: '请求格式不正确。' }); }
  const base = process.env.DIFY_BASE_URL?.trim();
  const key = process.env.DIFY_API_KEY?.trim();
  if (!base || !key) return json(res, 503, { error: '服务尚未配置 Dify，请在电脑端填写本地环境变量并重启服务。' });
  let url;
  try {
    url = new URL(`${base.replace(/\/+$/, '')}/workflows/run`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
  } catch { return json(res, 503, { error: 'Dify API 地址配置不正确，请检查本地配置。' }); }
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: { query: question }, response_mode: 'blocking', user: `demo-${randomUUID()}` }),
      signal: AbortSignal.timeout(120_000),
      redirect: 'error',
    });
    if (!upstream.ok) {
      const error = [401, 403].includes(upstream.status) ? 'Dify 授权失败，请检查本地 API Key。'
        : upstream.status === 429 ? 'Dify 请求繁忙或额度不足，请稍后再试。'
        : 'Dify 调用失败，请检查应用是否已发布、API 地址及工作流配置。';
      return json(res, 502, { error });
    }
    const result = await upstream.json();
    if (result.data?.status !== 'succeeded') return json(res, 502, { error: 'Dify 工作流未成功完成，请检查 Dify 运行记录后重试。' });
    const outputs = result.data.outputs || {};
    const text = ['business_answer', 'policy_answer', 'material_answer', 'compliance_answer']
      .map(name => outputs[name]).filter(value => typeof value === 'string' && value.trim()).join('\n\n');
    if (!text) return json(res, 502, { error: 'Dify 未返回有效回答，请检查工作流输出字段。' });
    return json(res, 200, { text });
  } catch (error) {
    return json(res, error.name === 'TimeoutError' ? 504 : 502, { error: error.name === 'TimeoutError'
      ? '查询超时，请稍后重新发送问题。' : '暂时无法连接 Dify，请检查网络和 API 地址后重试。' });
  }
}
