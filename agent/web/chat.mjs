const form = document.querySelector('#chat-form');
const input = document.querySelector('#question');
const send = document.querySelector('#send');
const reset = document.querySelector('#reset');
const messages = document.querySelector('#messages');
let busy = false;
function update() {
  send.disabled = busy || !input.value.trim();
  reset.disabled = busy;
  document.querySelectorAll('[data-question]').forEach(button => { button.disabled = busy; });
  messages.setAttribute('aria-busy', String(busy));
}
function add(role, text) {
  const article = document.createElement('article');
  article.className = `message ${role}`;
  const speaker = document.createElement('p'); speaker.className = 'speaker'; speaker.textContent = role === 'user' ? '你' : '矿业智询 · Pi Agent';
  const trace = document.createElement('div'); trace.className = 'trace';
  const answer = document.createElement('div'); answer.className = 'answer'; answer.textContent = text;
  article.append(speaker, trace, answer); messages.append(article);
  article.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return { article, trace, answer };
}
async function submit(value) {
  const question = value.trim();
  if (busy || !question) return;
  busy = true; input.value = ''; update(); add('user', question);
  const reply = add('assistant', '正在理解问题…');
  let final = false;
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }), signal: AbortSignal.timeout(110_000) });
    if (!response.ok) { const result = await response.json(); throw Error(result.error || '查询失败，请稍后再试。'); }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    function consume(line) {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === 'tool') {
        const item = document.createElement('div');
        item.textContent = `${event.status === 'running' ? '进行中' : event.status === 'done' ? '已完成' : '未成功'} · ${event.label}`;
        reply.trace.append(item); reply.answer.textContent = '正在整理查询结果…';
      }
      if (event.type === 'answer') { final = true; reply.answer.textContent = event.text; }
      if (event.type === 'error') throw Error(event.error);
    }
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(consume);
      }
      buffer += decoder.decode(); if (buffer.trim()) consume(buffer);
    } finally { await reader.cancel().catch(() => {}); }
    if (!final) throw Error('连接中断，请重新发送问题。');
  } catch (error) {
    reply.article.classList.add('error');
    reply.answer.textContent = ['TimeoutError', 'AbortError'].includes(error.name) ? '查询超时，请稍后重试。' : error instanceof TypeError ? '本地服务连接失败，请确认服务正在运行。' : error.message;
  } finally { busy = false; update(); reply.article.scrollIntoView({ block: 'end', behavior: 'smooth' }); input.focus(); }
}
form.addEventListener('submit', event => { event.preventDefault(); void submit(input.value); });
input.addEventListener('input', update);
input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => void submit(button.dataset.question)));
reset.addEventListener('click', async () => {
  if (busy) return; busy = true; update();
  try { const result = await fetch('/api/reset', { method: 'POST', signal: AbortSignal.timeout(5000) }); if (!result.ok) throw Error(); messages.replaceChildren(); }
  catch { add('assistant', '无法开始新对话，请确认服务连接。'); }
  finally { busy = false; update(); input.focus(); }
});
fetch('/api/info', { signal: AbortSignal.timeout(5000) }).then(r => r.json()).then(info => { document.querySelector('#model').textContent = `当前模型：${info.model} · 会话保留 30 分钟，最多 20 轮`; }).catch(() => { document.querySelector('#model').textContent = '服务连接失败，请确认本地服务正在运行。'; });
