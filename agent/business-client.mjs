export function toolResult(evidence) {
  return { content: [{ type: 'text', text: JSON.stringify(evidence) }], details: evidence };
}

export function createBusinessClient({ baseUrl, fetchImpl = fetch }) {
  const endpoint = new URL('/api/business-query', baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if ((endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) || endpoint.username || endpoint.password) {
    throw Error('业务服务地址须使用 HTTPS，本机开发可使用 HTTP。');
  }
  return async function query(params, signal, retried = false) {
    let response, result;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
      });
      result = await response.json();
    } catch { throw Error('业务服务连接失败或超时，无法判断查询结果。'); }
    if (!response.ok || result?.success !== true) {
      // Retry only an explicit not-found result; the backend still enforces uniqueness.
      const shortName = params.entity_type === 'mine' ? params.entity_keyword?.replace(/矿山$/, '').trim() : null;
      if (!retried && result?.error?.code === 'ENTITY_NOT_FOUND' && shortName && shortName.length >= 2 && shortName !== params.entity_keyword) {
        return query({ ...params, entity_keyword: shortName }, signal, true);
      }
      const messages = {
        AMBIGUOUS_ENTITY: '对象名称不唯一，请补充完整名称。',
        ENTITY_NOT_FOUND: '未找到该对象，请核对名称。',
        MULTIPLE_REPORT_RECORDS: '报告存在重复记录，需核对数据。',
        QUERY_LIMIT_EXCEEDED: '查询范围过大，请缩小范围。',
        INVALID_PARAMETER: '查询条件不完整或格式不正确，请补充或核对。',
        UNSUPPORTED_QUERY: '该属性或关系暂不支持查询。',
      };
      throw Error(messages[result?.error?.code] || '业务查询未成功，无法判断查询结果。');
    }
    if (!result.entity || typeof result.entity !== 'object' || Array.isArray(result.entity) || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
      throw Error('业务响应格式不完整，无法判断查询结果。');
    }
    return { success: true, entity: result.entity, data: result.data, source: 'business-query', queried_at: new Date().toISOString() };
  };
}
