// GET /api/info → 민원인 화면에 쓰는 처리 기간·문의처 — docs/답변참고문서 「성북구청 구청장에게 바란다 이용 안내」에서 읽는다
import { readDoc } from './_lib/docs.js';
import { send } from './_lib/http.js';

const FILE = '성북구청 구청장에게 바란다 이용 안내.md';

export default function handler(req, res) {
  const d = readDoc(FILE);
  if (!d) return send(res, 200, { ok: false, reason: '문서를 찾지 못함' });
  const period = (d.raw.match(/\*\*처리기간:\*\*\s*(.+)/) || [])[1]?.trim() || null;
  // 「성북구청 (정보제공부서 감사담당관, 02-2241-4901/2185)」 꼴
  const m = (d.meta['기관'] || '').match(/정보제공부서\s*([^,)]+),\s*([\d\-/]+)/);
  send(res, 200, {
    ok: true,
    period,                                   // 예: 7일(주말·공휴일 제외)이며, 필요하면 연장될 수 있다.
    contact: m ? { dept: `성북구청 ${m[1].trim()}`, tel: m[2].trim() } : null,
    source: { doc: d.title, checked: d.meta['확인 방법 · 확인일'] || '', url: d.meta['URL'] || '' },
  });
}
