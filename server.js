// 로컬 실행: npm run dev  (= node --env-file=.env server.js)
// public 폴더는 화면 파일로, /api/이름 은 api/이름.js 핸들러로 보낸다 — Vercel 과 같은 구조
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  let file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.statusCode = 403; return res.end('forbidden'); }
  try {
    if (!path.extname(file)) file += '.html'; // /officer → officer.html (Vercel cleanUrls 와 같게)
    await stat(file);
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('찾는 화면이 없습니다');
  }
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  const m = pathname.match(/^\/api\/([a-z]+)\/?$/);
  if (!m) return serveStatic(req, res);
  try {
    const mod = await import(pathToFileURL(path.join(ROOT, 'api', `${m[1]}.js`)).href);
    await mod.default(req, res);
  } catch (e) {
    const notFound = e.code === 'ERR_MODULE_NOT_FOUND';
    res.statusCode = notFound ? 404 : 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: notFound ? '없는 API' : '서버 오류', detail: notFound ? undefined : e.message }));
    if (!notFound) console.error(e);
  }
}).listen(PORT, () => console.log(`성북 안심 민원 필터 — http://localhost:${PORT}`));
