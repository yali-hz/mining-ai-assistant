export async function sendMessage({ question, onProgress = () => {} }) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(125_000),
  });
  if (response.ok && response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', answer;
    const consume = line => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === 'error') throw Error(event.error);
      if (event.type === 'tool') onProgress(`${event.status === 'running' ? '进行中' : event.status === 'done' ? '已完成' : '未成功'} · ${event.label}`);
      if (event.type === 'answer') answer = event.text;
    };
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(consume);
      }
      buffer += decoder.decode(); consume(buffer);
    } finally { await reader.cancel().catch(() => {}); }
    if (!answer) throw Error('连接中断，未收到完整回答，请重试。');
    return { text: answer };
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '查询暂时失败，请重新发送问题。');
  return result;
}
