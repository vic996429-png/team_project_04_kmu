// 실행: npm test — AI 키 없이 돌아가는 1차 표현 목록·챗봇 검색·AI 실패 시 표시를 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLexicon } from '../api/_lib/lexicon.js';
import { search } from '../api/chat.js';
import classify from '../api/classify.js';

for (const k of ['CLAUDE_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY']) delete process.env[k];

const T1 = '정릉천 산책로 가로등 5개 중 3개가 2주째 꺼져 있습니다. 저녁 6시만 지나도 매우 어두워 학생들이 넘어질 뻔했습니다. 수리와 임시 조명 설치, 결과 문자 회신 부탁드립니다. 감사합니다.';
const T2 = '길음역 앞 불법주차 신고한 지가 언제인데 아직도 그대로냐. 구청 직원들은 하나같이 무능한 월급 도둑이고 담당자 그 인간은 머리가 있긴 하냐. 쓸모없는 것들이 세금만 축내고 있다. 오늘 안에 안 치우면 가만 안 둔다.';
const T3 = '기초수급 탈락 통보 받았다. 담당자 퇴근길 조심해라. 어디 사는지 다 알아냈으니 집 앞에서 기다리겠다. 내 말 안 들으면 무슨 일이 생겨도 책임 못 진다. 가족까지 다 퍼뜨릴 거다.';
const T4 = '몇 번을 신고해야 합니까. 답답해서 미치겠습니다. 일을 이렇게 하시면 안 되죠. 이번 주 안에 처리해 주세요.';
const T5 = '공무원님 일 참 잘하십니다 ㅋㅋ 세금 값 하느라 아주 바쁘신가 봅니다. 신고한 쓰레기는 한 달째 그대로네요.';

test('1차 표현 목록: 정상 글은 정상, 모욕·협박 글은 잡는다', () => {
  assert.equal(checkLexicon(T1).stage, '정상');
  assert.equal(checkLexicon(T4).stage, '정상');
  assert.equal(checkLexicon(T2).stage, '차단후보');
  assert.equal(checkLexicon(T3).stage, '차단후보');
  assert.equal(checkLexicon(T5).stage, '검토필요');
});

test('1차 표현 목록: 일상 문장을 위협으로 오탐하지 않는다', () => {
  for (const s of ['집 앞에서 버스를 기다려도 오지 않습니다.', '가족과 함께 공원을 이용하는 주민입니다.', '어디 사는지 모르는 분이 주차를 하고 갑니다.', '담당자님이 퇴근 후에도 연락을 주셔서 감사합니다.']) {
    assert.equal(checkLexicon(s).stage, '정상', s);
  }
});

function call(body) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(data) { resolve({ status: this.statusCode, json: JSON.parse(data) }); } };
    classify({ method: 'POST', body }, res);
  });
}

test('AI 를 못 부를 때: 위협 글은 검토필요 이상, 표현이 없는 글은 「정상」이 아니라 미판단(null)', async () => {
  const bad = await call({ text: T3 });
  assert.notEqual(bad.json.stage, '정상');
  assert.equal(bad.json.demo, true);
  const none = await call({ text: '돌려 말하지만 선을 넘는 글입니다. 조용히 지내기 힘들게 해 주겠습니다.' });
  assert.equal(none.json.stage, null);
  assert.equal(none.json.unjudged, true);
});

test('챗봇 검색: 문서에 있는 질문은 근거를 찾고, 없는 질문은 비운다', () => {
  const a = search('욕설이 있으면 민원 접수를 거부할 수 있나요?');
  assert.ok(a.hits.length > 0);
  assert.ok(a.hits.some((c) => /접수/.test(c.heading + c.text)));
  assert.equal(search('오늘 점심 메뉴 추천해 줘').hits.length, 0);
});
