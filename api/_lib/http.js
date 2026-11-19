// Vercel 함수와 로컬 server.js 양쪽에서 같은 핸들러를 쓰기 위한 작은 도우미
export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export function query(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

// 공공 API 공통 fetch — 실패 이유를 「키 비어 있음 · 승인 안 됨 · 시간 초과 · 오류」로 나눈다
export async function fetchText(url, ms = 8000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    const text = await r.text();
    if (r.status === 401 || r.status === 403) return { ok: false, reason: '승인 안 됨', detail: `HTTP ${r.status}` };
    if (!r.ok) return { ok: false, reason: '오류', detail: `HTTP ${r.status}` };
    return { ok: true, text };
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return { ok: false, reason: '시간 초과', detail: `${ms / 1000}초 안에 응답 없음` };
    return { ok: false, reason: '오류', detail: e.message };
  }
}
