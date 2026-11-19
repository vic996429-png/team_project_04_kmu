// GET /api/law                       → 대상 법령·조례 5건의 현행 정보(시행일·공포)
// GET /api/law?law=minwon&view=history  → 변경이력(시행일 기준 연혁)
// GET /api/law?law=minwon&view=compare  → 신구법 비교
// GET /api/law?law=minwon&view=article&article=제4조 → 조문 본문
// LAW_OC(국가법령정보 공동활용 OC)로 실시간 조회, 실패하면 이유와 함께 docs/답변참고문서 내용을 「시연 값」으로 돌려준다.
import { fetchText, query, send } from './_lib/http.js';
import { getArticle, getSection, readDoc } from './_lib/docs.js';

const DRF = 'https://www.law.go.kr/DRF';

// 기획서 4.4 「관련 법·제도」의 대상
export const LAWS = {
  minwon: { name: '민원 처리에 관한 법률', kind: 'law', doc: '민원 처리에 관한 법률발췌.md', articles: ['제4조', '제23조'] },
  minwonEnf: { name: '민원 처리에 관한 법률 시행령', kind: 'law', doc: '민원 처리에 관한 법률 시행령발췌.md', articles: ['제4조'] },
  privacy: { name: '개인정보 보호법', kind: 'law', doc: '개인정보 보호법발췌.md', articles: ['제15조', '제29조'] },
  ai: { name: '인공지능 발전과 신뢰 기반 조성 등에 관한 기본법', kind: 'law', doc: '인공지능 발전과 신뢰 기반 조성 등에 관한 기본법발췌.md', articles: ['제31조', '제34조'] },
  ordin: { name: '서울특별시 성북구 민원업무담당 공무원 등의 보호 및 지원에 관한 조례', kind: 'ordin', doc: '서울특별시 성북구 민원업무담당 공무원 등의 보호 및 지원에 관한 조례.md', articles: ['제2조', '제4조', '제9조'] },
  // 홈페이지 게시물 관리 조례 — 제36조제2항은 욕설 게시물 삭제를 정하지만, 이 서비스는 삭제하지 않는다(둘을 구분)
  smart: { name: '서울특별시 성북구 지능정보화 기본 조례', kind: 'ordin', doc: '서울특별시 성북구 지능정보화 기본 조례발췌.md', articles: ['제36조', '제38조'], note: '홈페이지 게시물 관리 규정임 — 이 서비스는 게시물을 삭제하지 않음' },
};

// 법령이 아닌 참고 자료 — 조회할 공공 API 가 없어 문서 내용만 보여 준다
export const REFS = [
  { key: 'ethics', file: '공공부문 인공지능 윤리기준행정안전부.md', kind: '정부 기준(법률 의무 아님)', sections: ['③ 투명성', '④ 책임성', '⑤ 안전성', '⑥ 프라이버시 보호'] },
  { key: 'press', file: '반복·특이민원 공무원 개인이 아닌 기관이 책임지고 대응한다행정안전부·국민권익위원회 보도자료.md', kind: '보도자료', sections: ['확인한 내용'], caution: '「대량 민원 이용 제한」은 이 서비스가 하지 않는 기능임' },
];

function refs() {
  return REFS.map((r) => {
    const d = readDoc(r.file);
    if (!d) return { key: r.key, ok: false, reason: '문서를 찾지 못함' };
    const note = (d.raw.match(/^>\s*(.+)$/m) || [])[1] || '';
    return {
      key: r.key, ok: true, title: d.title, kind: r.kind, caution: r.caution || null,
      org: d.meta['기관'] || '', date: d.meta['게시일'] || d.meta['등록일'] || '',
      url: (d.meta['원문'] || d.meta['URL'] || '').split(' ')[0],
      checked: ((d.meta['확인 방법 · 확인일'] || '').match(/\d{4}-\d{2}-\d{2}/) || [])[0] || '',
      note: note.replace(/\*\*/g, ''),
      sections: r.sections.map((h) => getSection(r.file, h)).filter(Boolean),
      source: `docs/답변참고문서/${r.file}`,
    };
  });
}

// 응답 모양이 조금 달라도 이름으로 값을 찾는다
function deepFind(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const r = deepFind(v, key);
    if (r !== undefined) return r;
  }
  return undefined;
}
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const fmtDate = (d) => (/^\d{8}$/.test(String(d)) ? `${String(d).slice(0, 4)}.${String(d).slice(4, 6)}.${String(d).slice(6)}.` : d || '');

async function drf(path, params) {
  const oc = (process.env.LAW_OC || '').trim();
  if (!oc) return { ok: false, reason: '키 비어 있음' };
  const qs = Object.entries({ OC: oc, type: 'JSON', ...params }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const r = await fetchText(`${DRF}/${path}?${qs}`);
  if (!r.ok) return r;
  // 미승인 OC 는 JSON 대신 안내 문구(HTML/텍스트)가 온다
  if (/사용자\s*정보\s*검증|미신청|인증.*실패|등록되지\s*않은/.test(r.text)) return { ok: false, reason: '승인 안 됨', detail: 'OC 검증 실패(활용 신청·IP 등록 확인)' };
  try { return { ok: true, json: JSON.parse(r.text) }; } catch { return { ok: false, reason: '오류', detail: 'JSON 이 아닌 응답' }; }
}

// 현행 법령 1건 찾기 — 시행일 기준 법령(eflaw) 목록에서 이름이 같은 현행본
async function findLaw(t) {
  if (t.kind === 'ordin') {
    const r = await drf('lawSearch.do', { target: 'ordin', query: t.name, display: 20 });
    if (!r.ok) return r;
    const list = asArray(deepFind(r.json, 'law'));
    const hit = list.find((x) => (x['자치법규명'] || '').replace(/\s/g, '') === t.name.replace(/\s/g, '')) || list[0];
    if (!hit) return { ok: false, reason: '오류', detail: '검색 결과 없음' };
    return { ok: true, id: hit['자치법규ID'], info: { 공포일자: fmtDate(hit['공포일자']), 공포번호: hit['공포번호'], 시행일자: fmtDate(hit['시행일자']), 구분: hit['제개정구분명'] || hit['자치법규종류'], 기관: hit['지자체기관명'] } };
  }
  const r = await drf('lawSearch.do', { target: 'eflaw', query: t.name, nw: '3', display: 20 });
  if (!r.ok) return r;
  const list = asArray(deepFind(r.json, 'law'));
  const hit = list.find((x) => (x['법령명한글'] || '').replace(/\s/g, '') === t.name.replace(/\s/g, '')) || list[0];
  if (!hit) return { ok: false, reason: '오류', detail: '검색 결과 없음' };
  return { ok: true, id: hit['법령ID'], mst: hit['법령일련번호'], info: { 공포일자: fmtDate(hit['공포일자']), 공포번호: hit['공포번호'], 시행일자: fmtDate(hit['시행일자']), 구분: hit['제개정구분명'], 소관: hit['소관부처명'] } };
}

function demoCurrent(t) {
  const d = readDoc(t.doc);
  if (!d) return null;
  return { 공포: d.meta['공포'] || d.meta['공포일'] || '', 시행: d.meta['시행'] || d.meta['시행일'] || '', 상태: d.meta['상태'] || '', 원문: d.meta['원문'] || '', 비고: d.meta['비고'] || '', 대조: d.meta['국가법령정보센터 대조'] || '', 출처: `docs/답변참고문서/${t.doc}` };
}

async function current(key) {
  const t = LAWS[key];
  const live = await findLaw(t);
  if (live.ok) return { key, kind: t.kind, name: t.name, ok: true, live: true, info: live.info, link: `https://www.law.go.kr/${t.kind === 'ordin' ? '자치법규' : '법령'}/${t.name.replace(/\s/g, '')}` };
  return { key, kind: t.kind, name: t.name, ok: false, live: false, reason: live.reason, detail: live.detail, demo: demoCurrent(t) };
}

async function history(key) {
  const t = LAWS[key];
  if (t.kind === 'law') {
    const r = await drf('lawSearch.do', { target: 'eflaw', query: t.name, nw: '1,2,3', display: 30 });
    if (r.ok) {
      const items = asArray(deepFind(r.json, 'law'))
        .filter((x) => (x['법령명한글'] || '').replace(/\s/g, '') === t.name.replace(/\s/g, ''))
        .map((x) => ({ 시행일자: fmtDate(x['시행일자']), 공포일자: fmtDate(x['공포일자']), 공포번호: x['공포번호'], 구분: x['제개정구분명'], 상태: x['현행연혁코드'] }));
      return { key, name: t.name, ok: true, live: true, items };
    }
    return { key, name: t.name, ok: false, live: false, reason: r.reason, detail: r.detail, demo: demoCurrent(t) };
  }
  const r = await findLaw(t);
  if (r.ok) return { key, name: t.name, ok: true, live: true, items: [{ ...r.info, 상태: '현행' }] };
  return { key, name: t.name, ok: false, live: false, reason: r.reason, detail: r.detail, demo: demoCurrent(t) };
}

async function compare(key) {
  const t = LAWS[key];
  if (t.kind !== 'law') return { key, name: t.name, ok: false, live: false, reason: '신구법 비교는 법령만 제공', demo: demoCurrent(t) };
  const f = await findLaw(t);
  if (!f.ok) return { key, name: t.name, ok: false, live: false, reason: f.reason, detail: f.detail, demo: demoCurrent(t) };
  const r = await drf('lawService.do', { target: 'oldAndNew', ID: f.id });
  if (!r.ok) return { key, name: t.name, ok: false, live: false, reason: r.reason, detail: r.detail, demo: demoCurrent(t) };
  const exists = deepFind(r.json, '신구법존재여부');
  const pick = (k) => asArray(deepFind(deepFind(r.json, k), '조문')).slice(0, 12).map((x) => (typeof x === 'string' ? x : x.content || x['조문내용'] || JSON.stringify(x)));
  return { key, name: t.name, ok: true, live: true, exists: exists !== 'N', old: pick('구조문목록'), new: pick('신조문목록'), info: f.info };
}

async function article(key, art) {
  const t = LAWS[key];
  const demo = getArticle(t.doc, art);
  const f = await findLaw(t);
  if (f.ok) {
    const params = t.kind === 'ordin' ? { target: 'ordin', ID: f.id } : { target: 'eflaw', ID: f.id, JO: joCode(art) };
    const r = await drf('lawService.do', params);
    if (r.ok) {
      const units = asArray(deepFind(r.json, '조문단위') || deepFind(r.json, '조'));
      const hit = units.find((u) => JSON.stringify(u).includes(art)) || units[0];
      const text = hit ? flatten(hit) : '';
      if (text) return { key, name: t.name, article: art, ok: true, live: true, text: text.slice(0, 1500), info: f.info };
    }
    return { key, name: t.name, article: art, ok: false, live: false, reason: r.ok ? '오류' : r.reason, detail: r.ok ? '조문을 찾지 못함' : r.detail, demo };
  }
  return { key, name: t.name, article: art, ok: false, live: false, reason: f.reason, detail: f.detail, demo };
}

// 「제4조」→ 000400, 「제12조의2」→ 001202
function joCode(art) {
  const m = art.match(/제(\d+)조(?:의(\d+))?/);
  return m ? String(m[1]).padStart(4, '0') + String(m[2] || 0).padStart(2, '0') : '';
}
function flatten(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(flatten).join('\n');
  if (v && typeof v === 'object') return Object.entries(v).filter(([k]) => /내용|조문|항|호/.test(k)).map(([, x]) => flatten(x)).join('\n');
  return '';
}

export default async function handler(req, res) {
  const q = query(req);
  const key = q.get('law');
  const view = q.get('view') || 'current';
  if (view === 'refs') return send(res, 200, { items: refs() });
  if (!key) {
    const list = await Promise.all(Object.keys(LAWS).map(current));
    return send(res, 200, { view: 'current', items: list, notes: Object.fromEntries(Object.entries(LAWS).filter(([, v]) => v.note).map(([k, v]) => [k, v.note])), articles: Object.fromEntries(Object.entries(LAWS).map(([k, v]) => [k, v.articles])) });
  }
  if (!LAWS[key]) return send(res, 400, { error: '알 수 없는 법령' });
  if (view === 'history') return send(res, 200, await history(key));
  if (view === 'compare') return send(res, 200, await compare(key));
  if (view === 'article') return send(res, 200, await article(key, q.get('article') || LAWS[key].articles[0]));
  return send(res, 200, await current(key));
}
