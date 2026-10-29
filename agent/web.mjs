import express from 'express';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createConfiguredAgent } from './config.mjs';
import { connectBusiness } from './local-business.mjs';

const staticRoot = fileURLToPath(new URL('./web/', import.meta.url));
const labels = { search_knowledge: '检索知识库原文', query_report_status: '查询年度报告', query_entity: '查询对象信息', query_relations: '查询关联对象', check_report_deadline: '核对报告逾期规则' };

export function createAgentWeb({ createRuntime, modelName, now = Date.now, publicOrigin, demoPassword }) {
  const app = express();
  const sessions = new Map();
  let active = 0;
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json({ status: 'ok', agent: true, ...(process.env.RENDER_GIT_COMMIT ? { revision: process.env.RENDER_GIT_COMMIT } : {}) }));
  if (demoPassword) app.use((req, res, next) => {
    const expected = `Basic ${Buffer.from(`demo:${demoPassword}`).toString('base64')}`;
    if (req.headers.authorization === expected) return next();
    res.set('WWW-Authenticate', 'Basic realm="Mining demo", charset="UTF-8"');
    res.status(401).send('请输入演示账号和口令。');
  });
  app.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'" });
    next();
  });
  app.use('/api', (req, res, next) => {
    if (req.headers.origin && req.headers.origin !== (publicOrigin || `http://${req.headers.host}`)) return res.status(403).json({ error: '请从演示页面发起请求。' });
    next();
  }, express.json({ limit: '8kb' }));
  app.get('/api/info', (_req, res) => res.json({ model: modelName, mode: 'Pi Agent · 本地演示' }));

  function getSession(req, res) {
    for (const [id, session] of sessions) if (!session.busy && now() - session.touched > 30 * 60_000) sessions.delete(id);
    const cookie = req.headers.cookie?.match(/(?:^|;\s*)pi_session=([a-f0-9-]{36})(?:;|$)/)?.[1];
    let session = cookie && sessions.get(cookie);
    if (cookie && !session) return null;
    if (!session) {
      if (sessions.size >= 20) return null;
      const id = randomUUID();
      session = { runtime: createRuntime(), touched: now(), busy: false, turns: 0 };
      sessions.set(id, session);
      res.cookie('pi_session', id, { httpOnly: true, secure: publicOrigin?.startsWith('https:') || false, sameSite: 'strict', maxAge: 30 * 60_000, path: '/' });
    }
    session.touched = now();
    return session;
  }
  app.post('/api/reset', (req, res) => {
    const cookie = req.headers.cookie?.match(/(?:^|;\s*)pi_session=([a-f0-9-]{36})(?:;|$)/)?.[1];
    const session = sessions.get(cookie);
    if (session?.busy) return res.status(409).json({ error: '请等待当前回答完成后开始新对话。' });
    sessions.delete(cookie);
    res.clearCookie('pi_session', { path: '/' });
    res.json({ success: true });
  });
  app.post('/api/chat', async (req, res) => {
    const question = req.body?.question;
    if (typeof question !== 'string' || !question.trim() || question.length > 1000) return res.status(400).json({ error: '请输入 1–1000 字的问题。' });
    if (active >= 2) return res.status(429).json({ error: '当前查询较多，请稍后重试。' });
    let session;
    try { session = getSession(req, res); }
    catch { return res.status(503).json({ error: '模型配置不完整，请检查服务端配置。' }); }
    if (!session) return res.status(409).json({ error: '会话已过期或数量达到上限，请点击新对话。' });
    if (session.busy) return res.status(409).json({ error: '上一条问题仍在处理中。' });
    if (session.turns >= 20) return res.status(409).json({ error: '本次对话已满 20 轮，请开始新对话。' });
    session.busy = true; active++;
    res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const emit = value => { if (!res.destroyed) res.write(`${JSON.stringify(value)}\n`); };
    const unsubscribe = session.runtime.agent.subscribe(event => {
      if (event.type === 'tool_execution_start' || event.type === 'tool_execution_end') {
        emit({ type: 'tool', name: event.toolName, label: labels[event.toolName] || '业务工具',
          status: event.type === 'tool_execution_start' ? 'running' : event.isError ? 'error' : 'done' });
      }
    });
    const disconnected = () => { if (!res.writableEnded) session.runtime.agent.abort(); };
    res.on('close', disconnected);
    const heartbeat = setInterval(() => emit({ type: 'heartbeat' }), 10_000);
    try {
      const text = await session.runtime.ask(question);
      session.turns++;
      emit({ type: 'answer', text, model: modelName });
    } catch {
      emit({ type: 'error', error: '本次查询未完成，请检查模型、网络或业务服务后重试。' });
    } finally {
      clearInterval(heartbeat); unsubscribe();
      session.busy = false; session.touched = now(); active--;
      res.off('close', disconnected);
      res.end();
    }
  });
  app.get('/h5', (_req, res) => res.sendFile(fileURLToPath(new URL('../app/templates/index.html', import.meta.url))));
  app.use('/static', express.static(fileURLToPath(new URL('../app/static/', import.meta.url))));
  if (publicOrigin) app.get('/', (_req, res) => res.redirect('/h5'));
  app.use(express.static(staticRoot, { index: 'index.html' }));
  app.use((_req, res) => res.status(404).json({ error: '页面或接口不存在。' }));
  app.use((error, _req, res, _next) => res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: '请求格式无效。' }));
  return app;
}

async function main() {
  try { loadEnvFile(new URL('../.env', import.meta.url)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const hosted = process.env.RENDER === 'true';
  if (hosted && !process.env.DEMO_PASSWORD) throw Error('请配置演示访问口令。');
  const connection = await connectBusiness();
  const createRuntime = () => createConfiguredAgent({ baseUrl: connection.baseUrl });
  try { createRuntime(); } catch (error) { await connection.close(); throw error; }
  const app = createAgentWeb({ createRuntime, modelName: process.env.PI_MODEL, publicOrigin: process.env.RENDER_EXTERNAL_URL, demoPassword: process.env.DEMO_PASSWORD });
  const port = Number(hosted ? process.env.PORT || 10000 : process.env.PI_WEB_PORT || 5180);
  const server = app.listen(port, hosted ? '0.0.0.0' : '127.0.0.1', () => console.log(`Pi 服务已启动，端口：${server.address().port}，H5 路径：/h5`));
  server.on('error', async error => { console.error(error.code === 'EADDRINUSE' ? 'Pi 页面端口被占用，请关闭旧服务或修改 PI_WEB_PORT。' : '页面服务启动失败。'); await connection.close(); process.exitCode = 1; });
  const close = async () => { server.closeAllConnections(); server.close(); await connection.close(); process.exit(0); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Pi 页面启动失败，请核对模型及业务服务配置。'); process.exitCode = 1; });
