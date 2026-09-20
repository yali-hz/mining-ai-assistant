// Local page server and same-origin Dify proxy; secrets stay on the server.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { handleChat } from './dify.mjs';
try { loadEnvFile(new URL('../.env', import.meta.url)); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const routes = {
  '/': ['templates/index.html', 'text/html; charset=utf-8'],
  '/static/style.css': ['static/style.css', 'text/css; charset=utf-8'],
  '/static/chat.js': ['static/chat.js', 'text/javascript; charset=utf-8'],
  '/static/assistant.mjs': ['static/assistant.mjs', 'text/javascript; charset=utf-8'],
};
const port = Number(process.env.PORT || 5173);
http.createServer(async (req, res) => {
  if (new URL(req.url, 'http://localhost').pathname === '/api/chat') {
    await handleChat(req, res);
    return;
  }
  const route = routes[new URL(req.url, 'http://localhost').pathname];
  if (!route || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(new URL(route[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500).end('Unable to load preview');
  }
}).listen(port, '0.0.0.0', () => console.log(`Preview: http://localhost:${port}`));
