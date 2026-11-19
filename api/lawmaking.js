// GET /api/lawmaking?q=민원 → 국민참여입법센터 「진행 중인 입법예고」 목록 (LAWMAKING_OC)
// 요청 형식: https://www.lawmaking.go.kr/rest/ogLmPp.xml?OC=...&diff=0&lsNm=...  (diff 0 = 진행)
import { fetchText, query, send } from './_lib/http.js';

const FIELDS = ['ogLmPpSeq', 'lsNm', 'lsClsNm', 'asndOfiNm', 'pntcNo', 'pntcDt', 'stYd', 'edYd', 'readCnt'];

// 시연 값 — 기획서 참고자료 [19]의 입법예고(이미 종료된 건). 실시간 값이 아님을 화면에 표시한다
const DEMO = [{
  lsNm: '민원 처리에 관한 법률 일부개정법률안',
  asndOfiNm: '행정안전부',
  pntcNo: '행정안전부 공고 제2024-1216호',
  stYd: '2024.08.21.',
  edYd: '2024.09.30.',
  status: '종료',
  link: 'https://www.moleg.go.kr/lawinfo/makingInfo.mo?mid=a10104010000&lawSeq=79564&lawCd=0&lawType=TYPE5',
}];

function parseXml(xml) {
  // 항목마다 ogLmPpSeq 로 시작한다고 보고 잘라 낸다
  const blocks = xml.split(/<ogLmPpSeq>/).slice(1).map((b) => `<ogLmPpSeq>${b}`);
  return blocks.map((b) => {
    const o = {};
    for (const f of FIELDS) {
      const m = b.match(new RegExp(`<${f}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${f}>`));
      if (m) o[f] = m[1].trim();
    }
    if (o.ogLmPpSeq) o.link = `https://opinion.lawmaking.go.kr/gcom/ogLmPp/${o.ogLmPpSeq}`;
    return o;
  });
}

export default async function handler(req, res) {
  const q = query(req).get('q') || '민원';
  const oc = (process.env.LAWMAKING_OC || '').trim();
  if (!oc) return send(res, 200, { ok: false, live: false, reason: '키 비어 있음', q, demo: DEMO });
  const url = `https://www.lawmaking.go.kr/rest/ogLmPp.xml?OC=${encodeURIComponent(oc)}&diff=0&lsNm=${encodeURIComponent(q)}`;
  const r = await fetchText(url);
  if (!r.ok) return send(res, 200, { ok: false, live: false, reason: r.reason, detail: r.detail, q, demo: DEMO });
  if (!/<ogLmPpSeq>|<totalCnt>|<result/i.test(r.text) || /인증|권한|등록되지|IP/.test(r.text.slice(0, 400)) && !/<ogLmPpSeq>/.test(r.text)) {
    return send(res, 200, { ok: false, live: false, reason: '승인 안 됨', detail: 'OC 또는 등록 IP 확인 필요', q, demo: DEMO });
  }
  send(res, 200, { ok: true, live: true, q, items: parseXml(r.text) });
}
