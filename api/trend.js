// GET /api/trend → 국민권익위원회 민원빅데이터 분석정보(공공데이터포털) — 관리자 화면 「민원 키워드 동향」
// 공공데이터포털 키는 Encoding · Decoding 어느 쪽을 넣어도 동작한다.
import { fetchText, send } from './_lib/http.js';

export const DATA_KEY_ENV = 'DATA_GO_KR_KEY';
const BASE = 'https://apis.data.go.kr/1140100/minAnalsInfoView6';
// [확인 필요] 세부 오퍼레이션 이름 — 공공데이터포털 활용신청 상세 화면의 「요청주소」 끝부분을 넣는다.
// 비어 있으면 호출하지 않고 시연 값을 보여 준다.
const OPERATION = '';

// Encoding 키(%2B 등 포함)면 한 번 풀고, URL 에 넣을 때 한 번만 인코딩한다 → 이중 인코딩 방지
export function serviceKeyParam(raw) {
  const k = String(raw || '').trim();
  let decoded = k;
  if (/%[0-9A-Fa-f]{2}/.test(k)) { try { decoded = decodeURIComponent(k); } catch { decoded = k; } }
  return encodeURIComponent(decoded);
}

const DEMO = {
  note: '[가상 예시] 실시간 값이 아님 — 화면 구성을 보여 주기 위한 값',
  period: '최근 7일',
  items: [
    { label: '불법주차', count: 128 },
    { label: '가로등 고장', count: 74 },
    { label: '도로 파손', count: 61 },
    { label: '쓰레기 무단투기', count: 55 },
    { label: '소음', count: 39 },
  ],
};

function ymd(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }

export default async function handler(req, res) {
  const key = (process.env[DATA_KEY_ENV] || '').trim();
  if (!key) return send(res, 200, { ok: false, live: false, reason: '키 비어 있음', demo: DEMO });
  if (!OPERATION) return send(res, 200, { ok: false, live: false, reason: '요청 주소 확인 필요', detail: '오퍼레이션 이름 미입력', demo: DEMO });
  const to = new Date();
  const from = new Date(Date.now() - 7 * 864e5);
  const url = `${BASE}/${OPERATION}?serviceKey=${serviceKeyParam(key)}&target=pttn&dateFrom=${ymd(from)}&dateTo=${ymd(to)}&dataType=json`;
  const r = await fetchText(url);
  if (!r.ok) return send(res, 200, { ok: false, live: false, reason: r.reason, detail: r.detail, demo: DEMO });
  if (/SERVICE_KEY_IS_NOT_REGISTERED|SERVICE ACCESS DENIED|UNREGISTERED|NOT_REGISTERED/i.test(r.text)) {
    return send(res, 200, { ok: false, live: false, reason: '승인 안 됨', detail: '서비스 키 미등록 또는 활용 승인 전', demo: DEMO });
  }
  try {
    const json = JSON.parse(r.text);
    send(res, 200, { ok: true, live: true, raw: json });
  } catch {
    send(res, 200, { ok: false, live: false, reason: '오류', detail: 'JSON 이 아닌 응답', demo: DEMO });
  }
}
