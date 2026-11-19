// 1차 표현 목록 검사 — 띄어쓰기·특수문자·숫자 끼워 넣기, 자모 분리(ㅆㅣㅂㅏㄹ)를 되돌린 뒤 목록과 맞춰 본다
import { readFileSync } from 'node:fs';
import path from 'node:path';

const LEX_PATH = path.join(process.cwd(), 'api', '_data', 'lexicon.json');
let cache = null;
function loadTerms() {
  if (!cache) cache = JSON.parse(readFileSync(LEX_PATH, 'utf8')).terms;
  return cache;
}

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

// 낱자로 흩어 쓴 글자(ㅆㅣㅂㅏㄹ)를 한 글자(씨발)로 모은다. 자음만 있는 줄임말(ㅅㅂ)은 그대로 둔다
export function composeJamo(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = CHO.indexOf(s[i]);
    const v = c >= 0 ? JUNG.indexOf(s[i + 1] ?? '') : -1;
    if (c < 0 || v < 0) { out.push(s[i]); continue; }
    let t = 0;
    const next = s[i + 2] ?? '';
    const afterNext = s[i + 3] ?? '';
    const jongIdx = JONG.indexOf(next);
    if (next && jongIdx > 0 && JUNG.indexOf(afterNext) < 0) { t = jongIdx; i += 1; }
    out.push(String.fromCharCode(0xac00 + (c * 21 + v) * 28 + t));
    i += 1;
  }
  return out.join('');
}

// 비교용 정규화: 한글·자모만 남기고 모두 지운 뒤 자모를 모은다
export function normalize(text = '') {
  const onlyHangul = String(text).replace(/[^가-힣ㄱ-ㅣ]/g, '');
  return composeJamo(onlyHangul);
}

const ORDER = { 정상: 0, 검토필요: 1, 차단후보: 2 };

export function checkLexicon(text = '') {
  const started = process.hrtime.bigint();
  const norm = normalize(text);
  const hits = [];
  for (const t of loadTerms()) {
    const key = normalize(t.term) || t.term;
    if (norm.includes(key) && !hits.some((h) => h.term === t.term)) hits.push({ term: t.term, type: t.type, stage: t.stage });
  }
  // 긴 표현이 짧은 표현을 품으면(개새끼 ⊃ 새끼) 짧은 쪽은 뺀다
  const pruned = hits.filter((h) => !hits.some((o) => o !== h && o.term.length > h.term.length && o.term.includes(h.term)));
  const stage = pruned.reduce((acc, h) => (ORDER[h.stage] > ORDER[acc] ? h.stage : acc), '정상');
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { stage, hits: pruned, ms: Math.round(ms * 100) / 100 };
}
