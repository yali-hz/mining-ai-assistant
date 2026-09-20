import { sendMessage } from './assistant.mjs';

const form = document.querySelector('#chat-form');
const input = document.querySelector('#question');
const send = document.querySelector('#send');
const messages = document.querySelector('#messages');
const content = document.querySelector('#content');
let pending = false;

function updateInput() {
  send.disabled = pending || !input.value.trim();
  input.style.height = '36px';
  input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
}
function addMessage(role, text, loading = false) {
  const article = document.createElement('article');
  article.className = `message ${role}${loading ? ' loading' : ''}`;
  const name = document.createElement('p');
  name.className = 'message-name';
  name.textContent = role === 'user' ? '您' : '✦ AI智能助手';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  article.append(name, bubble);
  messages.append(article);
  content.scrollTop = content.scrollHeight;
  return article;
}
async function submit(question) {
  question = question.trim();
  if (!question || pending) return;
  pending = true;
  input.value = '';
  updateInput();
  addMessage('user', question);
  const reply = addMessage('assistant', '正在查询…', true);
  try {
    const result = await sendMessage({ question });
    reply.querySelector('.bubble').textContent = result.text;
  } catch {
    reply.querySelector('.bubble').textContent = '查询暂时失败，请重新发送问题。';
  } finally {
    reply.classList.remove('loading');
    pending = false;
    updateInput();
    content.scrollTop = content.scrollHeight;
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  void submit(input.value);
});
input.addEventListener('input', updateInput);
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});
document.querySelectorAll('[data-question]').forEach(button => {
  button.addEventListener('click', () => void submit(button.dataset.question));
});
