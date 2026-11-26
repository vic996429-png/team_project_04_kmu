// 민원인 화면 — 내부 단계(정상/검토필요/차단후보)는 민원인에게 보이지 않는다.
// 안내 창은 1차 목록과 2차 AI 가 모두 차단후보일 때만 뜨고, 어느 선택이든 접수된다(기획 제약 R4-4).
import { api, addComplaint, esc, isManual, seedIfEmpty, snackbar, taped } from './store.js';

seedIfEmpty();

// 처리 기간·문의처는 답변참고문서 「구청장에게 바란다 이용 안내」에서 읽어 온다
(async () => {
  try {
    const info = await api('/api/info');
    if (!info.ok) throw new Error(info.reason);
    // 문서 문장(「…이며, 필요하면 연장될 수 있다.」)을 화면 말투로 바꾼다
    const period = info.period ? info.period.replace(/이며,?\s*/, ', ').replace(/있다\.?$/, '있습니다') : null;
    if (period) {
      document.querySelector('#period-line').textContent = `처리 기간은 ${period}.`;
    }
    if (info.contact) document.querySelector('#done-contact').textContent = `${info.contact.dept} ${info.contact.tel}`;
  } catch {
    document.querySelector('#period-line').textContent = '처리 기간은 성북구청 누리집 안내를 확인해 주세요.';
  }
})();

const $ = (s) => document.querySelector(s);
const form = $('#form');
const title = $('#title');
const category = $('#category');
const text = $('#text');
const submitBtn = $('#submit');
const guide = $('#guide');

// [가상 예시] — 실제 민원 아님
const SAMPLES = [
  ['보문동 보도블록 파손', '도로·시설', '보문동 주민센터 앞 보도블록이 깨져서 어제 어르신이 넘어질 뻔했습니다. 빠른 보수 부탁드립니다.'],
  ['쓰레기 수거 지연', '환경·청소', '벌써 세 번째 신고입니다. 도대체 일을 하긴 하는 건가요? 골목에 쓰레기가 일주일째 쌓여 있습니다.'],
  ['주차 단속 문의', '교통·주차', '단속하시는 분들은 세금으로 월급 받으면서 하루 종일 놀고만 계시네요. 우리 집 앞 불법주차는 왜 안 잡나요?'],
  ['민원 처리 지연', '기타', '씨발 민원 넣은 지 한 달인데 아직도 안 고쳐? 내일까지 안 되면 찾아가서 가만 안 둔다.'],
];

// 작성 중인 글은 이 브라우저에만 잠시 저장한다(접수하면 지움). 새로 고침·실수로 닫아도 글을 잃지 않게 한다
const DRAFT = 'sb.draft';
const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch { return null; } };
function saveDraft() {
  const d = { title: title.value, category: category.value, text: text.value };
  try {
    if (!d.title.trim() && !d.text.trim()) localStorage.removeItem(DRAFT); else localStorage.setItem(DRAFT, JSON.stringify(d));
  } catch { /* 저장소를 쓸 수 없어도 작성에는 지장 없음 */ }
  const has = Boolean(d.title.trim() || d.text.trim());
  $('#draft-clear').hidden = !has;
  $('#draft-state').textContent = has ? '작성 중인 글은 이 브라우저에 자동으로 저장됩니다.' : '';
}
[title, category, text].forEach((el) => el.addEventListener('input', saveDraft));
$('#draft-clear').addEventListener('click', () => {
  form.reset(); text.dispatchEvent(new Event('input')); saveDraft(); resetRevision(); title.focus(); snackbar('작성 중인 글을 지웠습니다.');
});
{ const d = readDraft(); if (d && (d.title || d.text)) { title.value = d.title || ''; category.value = d.category || category.value; text.value = d.text || ''; text.dispatchEvent(new Event('input')); saveDraft(); snackbar('작성 중이던 글을 불러왔습니다.'); } }

let pending = null;      // 안내 창을 띄운 민원
let revision = null;     // '제안대로 고치기' | '직접 고치기' — 고친 글은 안내 창 없이 접수
let firstText = null;    // 고치기 전 글

$('#agree-required').addEventListener('change', (e) => {
  if (e.target.checked) { $('#consent-err').textContent = ''; e.target.removeAttribute('aria-invalid'); }
});
text.addEventListener('input', () => { $('#count').textContent = text.value.length.toLocaleString(); $('#text-err').textContent = ''; });
document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => {
  const [t, c, body] = SAMPLES[b.dataset.sample];
  title.value = t; category.value = c; text.value = body;
  text.dispatchEvent(new Event('input'));
  resetRevision();
}));

function resetRevision() {
  revision = null; firstText = null;
  submitBtn.textContent = '민원 접수하기';
}

function busy(on) {
  submitBtn.disabled = on;
  submitBtn.classList.toggle('is-busy', on);
  submitBtn.textContent = on ? '표현을 살펴보는 중' : (revision ? '고친 내용으로 접수하기' : '민원 접수하기');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!title.value.trim()) { title.focus(); snackbar('제목을 적어 주세요.'); return; }
  if (!text.value.trim()) { $('#text-err').textContent = '내용을 적어 주세요.'; text.focus(); return; }
  // H6: 필수 동의가 없으면 접수하지 않는다(입력란 옆에 이유를 남김)
  const agreeReq = $('#agree-required');
  if (!agreeReq.checked) {
    $('#consent-err').textContent = '개인정보 수집·이용(필수)에 동의해야 이 화면으로 접수할 수 있습니다.';
    agreeReq.setAttribute('aria-invalid', 'true');
    agreeReq.focus();
    return;
  }
  const aiConsent = $('#agree-ai').checked;
  const base = { title: title.value.trim(), category: category.value, original: text.value.trim(), aiConsent };

  if (isManual()) { // 관리자가 AI 표시를 멈춘 동안은 AI 없이 바로 접수
    return finish(addComplaint({ ...base, masked: null, stage: null, manual: true, citizenChoice: revision || '바로 접수' }));
  }
  if (!aiConsent) { // AI 살펴보기에 동의하지 않으면 외부 AI 로 보내지 않고 바로 접수
    return finish(addComplaint({ ...base, masked: null, stage: null, citizenChoice: '바로 접수' }));
  }

  busy(true);
  let res;
  try {
    res = await api('/api/classify', { text: base.original, title: base.title });
  } catch (err) {
    busy(false);
    // AI·서버가 실패해도 민원은 접수한다
    snackbar('표현 살펴보기에 실패해 AI 표시 없이 접수했습니다.');
    return finish(addComplaint({ ...base, masked: null, stage: null, aiError: err.message, citizenChoice: revision || '바로 접수' }));
  }
  busy(false);

  if (res.stage === '차단후보' && !revision) {
    pending = { base, res };
    openGuide(res);
    return;
  }
  finish(save(base, res, revision || '바로 접수', Boolean(revision)));
});

function save(base, res, choice, guideShown) {
  const { stage, lexiconStage, aiStage, lexiconHits, masked, piiFound, evidence, reason, normalReason, softened, summary, aiGenerated, provider, model, demo, tried, basis, basisNote, basisDropped, notices, safeTitle } = res;
  return addComplaint({
    ...base, stage, lexiconStage, aiStage, lexiconHits, masked, piiFound, evidence, reason, normalReason, softened, summary,
    aiGenerated, provider, model, demo, tried, basis, basisNote, basisDropped, notices, safeTitle, citizenChoice: choice, guideShown, firstText: firstText || undefined,
  });
}

function openGuide(res) {
  const ev = res.evidence?.length ? res.evidence : [res.masked];
  $('#guide-evidence').innerHTML = ev.map((s) => `<li>${taped(s)}</li>`).join('');
  $('#guide-reason').textContent = res.reason ? `이유: ${res.reason}` : '';
  $('#guide-suggest').innerHTML = taped(res.softened || '');
  $('#use-suggest').disabled = !res.softened || res.demo;
  guide.showModal();
}

$('#use-suggest').addEventListener('click', () => {
  firstText = pending.base.original;
  text.value = pending.res.softened;
  text.dispatchEvent(new Event('input'));
  revision = '제안대로 고치기';
  guide.close();
  // 제안 문장에는 가린 개인정보(***)가 그대로 있으므로, 있으면 민원인이 채운 뒤 접수하게 한다
  if (text.value.includes('***')) {
    submitBtn.textContent = '고친 내용으로 접수하기';
    text.focus();
    snackbar('*** 자리는 가린 개인정보입니다. 필요하면 다시 적은 뒤 접수하세요.');
    return;
  }
  form.requestSubmit();
});

$('#self-edit').addEventListener('click', () => {
  firstText = pending.base.original;
  revision = '직접 고치기';
  guide.close();
  submitBtn.textContent = '고친 내용으로 접수하기';
  text.focus();
  snackbar('내용을 고친 뒤 「고친 내용으로 접수하기」를 누르세요.');
});

$('#send-as-is').addEventListener('click', () => {
  guide.close();
  finish(save(pending.base, pending.res, '그대로 제출', true), true);
});

function finish(c, maskedNotice = false) {
  pending = null;
  try { localStorage.removeItem(DRAFT); } catch {}
  $('#write-card').closest('.citizen__grid').hidden = true;
  $('#done').hidden = false;
  $('#done-id').textContent = c.id;
  $('#done-masked').textContent = maskedNotice ? '일부 표현은 가려진 채 담당자에게 전달됩니다. ' : '';
  window.scrollTo({ top: 0 });
  // H8: 작성 영역이 사라지므로 완료 제목으로 초점을 옮겨 화면낭독기가 결과를 읽게 한다
  $('#done-title').focus();
}

$('#copy-id').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#done-id').textContent); snackbar('접수번호를 복사했습니다.'); }
  catch { snackbar('복사하지 못했습니다. 번호를 직접 적어 두세요.'); }
});

$('#again').addEventListener('click', () => {
  form.reset();
  text.dispatchEvent(new Event('input'));
  resetRevision();
  $('#done').hidden = true;
  $('#write-card').closest('.citizen__grid').hidden = false;
  title.focus();
});
