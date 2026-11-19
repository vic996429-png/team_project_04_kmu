// 브라우저 저장소(localStorage) — 시연용. 실제 민원·개인정보는 넣지 않는다(기획 제약 R4-5).
// 판단 이력은 덧붙이기만 한다. 각 줄에 앞 줄의 지문(해시)을 넣어, 중간을 고치면 관리자 화면에서 드러난다.

const K = { list: 'sbf.complaints', log: 'sbf.log', manual: 'sbf.manual', seeded: 'sbf.seeded.v1' };
export const STAGES = ['정상', '검토필요', '차단후보'];
export const CHANGE_REASONS = ['문맥상 정당한 요구임', '표현 수위가 AI 판단보다 낮음', '표현 수위가 AI 판단보다 높음', '1·2차 판단이 엇갈려 직접 확인함', '기타'];

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ── 공통 도우미 ────────────────────────────────
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// ○○ 와 *** 를 「가림 테이프」로 바꿔 그린다
export function taped(s) {
  return esc(s).replace(/○○/g, '<span class="tape" role="img" aria-label="가린 표현"></span>')
    .replace(/\*\*\*/g, '<span class="tape tape--pii" role="img" aria-label="가린 개인정보"></span>');
}
// 원문에서 목록에 걸린 표현을 표시(글자 사이 띄어쓰기·기호 허용, 한글은 끼워 넣기로 보지 않음)
export function highlight(text, terms = []) {
  let html = esc(text);
  for (const t of terms) {
    if (!t || /[○()]/.test(t)) continue;
    const re = new RegExp(t.split('').map((c) => esc(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^가-힣ㄱ-ㅣA-Za-z<>]*'), 'g');
    html = html.replace(re, (m) => `<mark class="hit">${m}</mark>`);
  }
  return html;
}
export const stageClass = (s) => ({ 정상: 'normal', 검토필요: 'review', 차단후보: 'block' }[s] || '');
export function stageBadge(s) {
  if (!s) return '<span class="badge">AI 미표시</span>';
  return `<span class="badge badge--${stageClass(s)}"><span class="dot dot--${stageClass(s)}" aria-hidden="true"></span>${esc(s)}</span>`;
}
export function fmt(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function snackbar(msg) {
  document.querySelector('.snackbar')?.remove();
  const el = Object.assign(document.createElement('div'), { className: 'snackbar', role: 'status', textContent: msg });
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}
export async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `요청 실패(${r.status})`);
  return j;
}

// ── 판단 이력(덧붙이기 전용, 지문 사슬) ─────────
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function getLog() { return read(K.log, []); }
export function appendLog(entry) {
  const log = getLog();
  const prev = log.length ? log[log.length - 1].hash : '00000000';
  const row = { seq: log.length + 1, at: new Date().toISOString(), ...entry, prev };
  row.hash = fnv(prev + JSON.stringify({ ...row, hash: undefined }));
  log.push(row);
  write(K.log, log);
  return row;
}
export function verifyLog() {
  let prev = '00000000';
  for (const row of getLog()) {
    const expect = fnv(prev + JSON.stringify({ ...row, hash: undefined }));
    if (row.prev !== prev || row.hash !== expect) return { ok: false, at: row.seq };
    prev = row.hash;
  }
  return { ok: true };
}

// ── 민원 ──────────────────────────────────────
export function getComplaints() { return read(K.list, []); }
export function getComplaint(id) { return getComplaints().find((c) => c.id === id); }
function nextId(list) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const n = list.filter((c) => c.id.includes(ymd)).length + 1;
  return `SB-${ymd}-${String(n).padStart(3, '0')}`;
}
export function addComplaint(data) {
  const list = getComplaints();
  const c = { id: nextId(list), createdAt: new Date().toISOString(), officerStage: null, officerReason: null, decidedAt: null, ...data };
  list.unshift(c);
  write(K.list, list);
  appendLog({ complaintId: c.id, actor: '민원인', action: '접수', choice: c.citizenChoice || '바로 접수', input: c.masked || '' });
  if (c.stage) appendLog({ complaintId: c.id, actor: 'AI', action: 'AI 표시', toStage: c.stage, lexiconStage: c.lexiconStage, aiStage: c.aiStage, provider: c.provider || (c.demo ? '시연 값' : null), model: c.model || null });
  return c;
}
export function decide(id, stage, reason) {
  const list = getComplaints();
  const c = list.find((x) => x.id === id);
  if (!c) return null;
  const from = c.officerStage ?? c.stage;
  c.officerStage = stage;
  c.officerReason = reason || null;
  c.decidedAt = new Date().toISOString();
  write(K.list, list);
  appendLog({ complaintId: id, actor: '담당자', action: stage === c.stage ? '단계 확정' : '단계 변경', fromStage: from, toStage: stage, aiStage: c.stage, reason: reason || null });
  return c;
}
export const effectiveStage = (c) => c.officerStage ?? c.stage;

// R4: 원문을 열람 전에 보여 줘도 되는 경우 — AI 가 실제로 「정상」이라고 판단했고 최종 결합도 정상일 때만
export const isOpenByDefault = (c) => c.stage === '정상' && c.aiStage === '정상';

// R3: 담당자·관리자 화면에 쓰는 제목. 원문을 열 수 있는 글은 원래 제목, 그 밖에는 가린 제목
export function safeTitleOf(c) {
  if (isOpenByDefault(c) || c.seed) return c.title;
  if (c.safeTitle) return c.safeTitle;
  return '제목 가림 · 원문 보기에서 확인';
}

// 소명 의견 — 표현을 가린 채 처리하기로 확정된 민원에 민원인이 의견을 낸다(기획서 4.3, 기한 7일은 [팀 설계안])
export function addObjection(id, text) {
  const list = getComplaints();
  const c = list.find((x) => x.id === id);
  if (!c) return null;
  c.objections = [...(c.objections || []), { at: new Date().toISOString(), text }];
  write(K.list, list);
  appendLog({ complaintId: id, actor: '민원인', action: '소명 의견 제출' });
  return c;
}

// 처리 기한: 접수일 다음 날부터 주말을 뺀 n일째(공휴일은 반영하지 않음)
export function dueDate(iso, days = 7) {
  const d = new Date(iso);
  let n = 0;
  while (n < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) n += 1;
  }
  return d;
}

// ── 수동 모드(AI 표시 일시 중지) ─────────────────
export const isManual = () => read(K.manual, false) === true;
export function setManual(on, reason) {
  write(K.manual, !!on);
  appendLog({ actor: '관리자', action: on ? 'AI 표시 일시 중지' : 'AI 표시 다시 켜기', reason: reason || null });
}

// ── 시연 데이터: 기획서 표 2 [가상 예시] 10건 ──────
const SEED = [
  ['가로등 고장', '도로·시설', '성북동 골목 가로등이 일주일째 꺼져 있어 밤길이 위험합니다. 빨리 고쳐 주세요.', '정상', '정상', '정상', [], '생활 불편을 공격 표현 없이 요청함', '가로등 수리 요청', null, '성북동 골목 가로등이 일주일째 꺼져 있어 수리를 요청함.'],
  ['불법주차 단속 기준', '교통·주차', '불법주차 단속 기준이 부서마다 달라 주민만 피해를 봅니다. 지침을 다시 검토해야 합니다.', '정상', '정상', '정상', [], '정책 비판은 정당한 의견', '단속 기준 통일 요청', null, '부서마다 다른 불법주차 단속 기준을 다시 검토해 달라는 요청.'],
  ['도로 보수 재요청', '도로·시설', '도대체 몇 번을 건의해야 도로를 고쳐 줍니까? 정말 답답하고 화가 납니다.', '정상', '정상', '정상', [], '강한 불만이지만 특정인 모욕·욕설 없음', '도로 보수 요청', null, '여러 번 건의한 도로 보수가 되지 않아 처리를 다시 요청함.'],
  ['업무 처리 불만', '기타', '담당자가 일을 이렇게밖에 못 하나요? 업무 처리가 너무 미숙합니다.', '정상', '정상', '정상', [], '업무 능력 비판이며 욕설·인격 모욕 아님', '업무 처리 개선 요청', null, '담당자의 업무 처리가 미숙하다는 불만.'],
  ['직원 근무 태도', '기타', '구청 직원분들은 하루 종일 커피만 마시며 신선놀음 하시나 봐요.', '검토필요', '검토필요', '검토필요', ['신선놀음'], '직접 욕설은 없으나 집단을 비꼬는 맥락', '근무 태도에 대한 의견으로 볼 여지가 있음', '구청 직원분들의 근무 태도가 아쉽습니다.', '구청 직원의 근무 태도에 대한 불만.'],
  ['처리 결과 불만', '기타', '담당자분 완전 ○○ 수준이네요. 초등학생도 이것보단 잘하겠어요 ㅋㅋ', '검토필요', '검토필요', '검토필요', ['초등학생도'], '은어·조롱이 섞여 사람의 판단이 필요', '처리 결과에 대한 불만 제기', '담당자분의 업무 처리가 많이 미흡하다고 느낍니다.', '담당자의 처리 결과가 미흡하다는 불만.'],
  ['징계 청구 예고', '기타', '그렇게 일하면 목 날아갈 줄 알아. 정식으로 징계 청구할 테니 각오해.', '검토필요', '검토필요', '차단후보', ['목날아', '각오해'], '징계 청구는 정당한 권리이나 위협적 표현이 섞임(1·2차 판단 충돌 예)', '정식 징계 청구 의사 표시는 정당한 권리', '이런 방식으로 업무를 처리하시면 정식으로 징계를 청구하겠습니다.', '업무 처리에 불만이 있어 징계를 청구하겠다는 의사 표시.'],
  ['민원 처리 지연', '기타', '야 이 ○○들아, 민원 넣은 지가 언젠데 일을 안 해? 머리에 ○○만 찼냐?', '차단후보', '차단후보', '차단후보', ['○○(가린 욕설)'], '뚜렷한 욕설과 인격 모욕', '접수한 민원의 처리 지연에 대한 항의', '민원을 넣은 지 오래되었는데 아직 처리되지 않았습니다. 빨리 처리해 주세요.', '접수한 민원이 오랫동안 처리되지 않아 빠른 처리를 요구함.'],
  ['처리 기한 요구', '기타', '내일까지 처리 안 되면 ○○ 들고 찾아가서 가만 안 둔다.', '차단후보', '차단후보', '차단후보', ['가만안둔다', '찾아가서'], '흉기 언급과 신체 위협', '처리 기한에 대한 요구', '내일까지 처리해 주시기 바랍니다.', '내일까지 민원을 처리해 달라고 요구함(위협 표현 포함).'],
  ['민원 처리 요청', '기타', '목소리 들으니 기분 좋네, 민원 들어주면 맛있는 거 사줄게, 예쁘게 하고 나와.', '차단후보', '차단후보', '차단후보', ['예쁘게하고', '목소리들으니', '맛있는거사줄'], '성적 대상화·성희롱 표현', '민원 처리 요청(구체적 요구 없음)', '민원을 처리해 주시기 바랍니다.', '구체적 요구 없이 처리만 요청함(성희롱 표현 포함).'],
];

export function seedIfEmpty(force = false) {
  // 이미 넣었거나, 민원이 하나라도 있으면 덮어쓰지 않는다
  if (!force && (read(K.seeded, false) || getComplaints().length)) return;
  // R8: 초기화해도 판단 이력은 지우지 않고, 초기화했다는 줄을 덧붙인다(덧붙이기 전용 원칙)
  if (force) {
    localStorage.removeItem(K.list); localStorage.removeItem(K.manual);
    appendLog({ actor: '관리자', action: '시연 데이터 초기화', reason: '민원 목록을 가상 예시 10건으로 되돌림(이력은 보존)' });
  }
  const base = Date.now();
  const list = [];
  SEED.forEach(([title, category, text, stage, lex, ai, hits, reason, normalReason, softened, summary], i) => {
    const created = new Date(base - (SEED.length - i) * 3.7 * 3600e3).toISOString();
    list.unshift({
      id: `SB-DEMO-${String(i + 1).padStart(3, '0')}`, createdAt: created, title, category,
      original: text, masked: text, stage, lexiconStage: lex, aiStage: ai,
      lexiconHits: hits.map((t) => ({ term: t })), evidence: stage === '정상' ? [] : [text],
      reason, normalReason, softened: softened ?? text, summary,
      aiGenerated: false, provider: null, model: null, demo: true, seed: true,
      citizenChoice: stage === '차단후보' ? '그대로 제출' : '바로 접수',
      basis: [], officerStage: null, officerReason: null, decidedAt: null,
    });
  });
  write(K.list, list);
  for (const c of [...list].reverse()) appendLog({ complaintId: c.id, actor: '시연 데이터', action: 'AI 표시', toStage: c.stage, lexiconStage: c.lexiconStage, aiStage: c.aiStage, provider: '시연 값' });
  write(K.seeded, true);
}
