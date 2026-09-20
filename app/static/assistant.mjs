export async function sendMessage({ question }) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(125_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '查询暂时失败，请重新发送问题。');
  return result;
}
