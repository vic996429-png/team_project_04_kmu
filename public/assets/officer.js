// 담당자 현황판 — 순화본·요약을 먼저 보여 주고 원문은 [원문 보기]로만 연다(기획서 3.1-6).
// 단계 확정·변경은 담당자만 하고, 모든 행동은 판단 이력에 덧붙인다.
import {
  dueDate, STAGES, CHANGE_REASONS, api, appendLog, decide, effectiveStage, esc, fmt, getComplaints, getComplaint,
  highlight, isManual, isOpenByDefault, safeTitleOf, seedIfEmpty, snackbar, stageBadge, taped,
} from './store.js';

seedIfEmpty();
const $ = (s, el = document) => el.querySelector(s);
const TABS = [...STAGES, 'AI 미표시'];
let tab = '검토필요';
let selected = location.hash.slice(1) || null;

$('#manual-flag').hidden = !isManual();

function bucket(c) { return effectiveStage(c) || 'AI 미표시'; }

function renderTabs() {
  const all = getComplaints();
  $('#tabs').innerHTML = TABS.map((t) => {
    const n = all.filter((c) => bucket(c) === t).length;
    return `<button role="tab" aria-selected="${t === tab}" data-tab="${t}">${t === '정상' || t === 'AI 미표시' ? '' : `<span class="dot dot--${t === '검토필요' ? 'review' : 'block'}" aria-hidden="true"></span>`}${t}<span class="count">${n}</span></button>`;
  }).join('');
}

// 처리 기한까지 남은 날(달력 기준). 이미 확정한 민원은 표시하지 않는다
function dday(c) {
  if (c.officerStage) return '';
  const days = Math.ceil((dueDate(c.createdAt).setHours(23, 59, 59) - Date.now()) / 864e5);
  if (days < 0) return `<span class="badge badge--block">기한 ${-days}일 지남</span>`;
  if (days <= 2) return `<span class="badge badge--review">기한 D-${days}</span>`;
  return `<span class="badge">기한 D-${days}</span>`;
}

function renderList() {
  const q = ($('#q')?.value || '').trim().toLowerCase();
  const order = $('#sort')?.value || 'due';
  let items = getComplaints().filter((c) => bucket(c) === tab)
    .filter((c) => !q || `${c.id} ${safeTitleOf(c)} ${c.summary || ''}`.toLowerCase().includes(q));
  items = [...items].sort((a, b) => (new Date(a.createdAt) - new Date(b.createdAt)) * (order === 'new' ? -1 : 1));
  if (!items.length) { $('#list').innerHTML = `<li class="empty">${esc(tab)} 민원이 없습니다.</li>`; return; }
  $('#list').innerHTML = items.map((c) => `
    <li class="item" role="option" tabindex="0" aria-selected="${c.id === selected}" data-id="${esc(c.id)}">
      <div class="item__top"><span>${esc(c.id)}</span><span>${fmt(c.createdAt)}</span></div>
      <div class="item__title">${taped(safeTitleOf(c))}</div>
      <div class="item__sum">${taped(c.summary || '(AI 요약 없음 — 원문 확인 필요)')}</div>
      <div class="item__tags">
        ${c.officerStage ? '<span class="badge">담당자 확정</span>' : '<span class="badge badge--demo">확정 전</span>'}
        ${dday(c)}
        ${c.seed ? '<span class="badge badge--demo">가상 예시</span>' : ''}
        ${c.guideShown ? `<span class="badge">${esc(c.citizenChoice)}</span>` : ''}
      </div>
    </li>`).join('');
}

function aiLine(c) {
  if (c.manual) return '<span class="badge">AI 표시 중지 중 접수</span>';
  if (c.aiConsent === false) return '<span class="badge">민원인이 AI 살펴보기에 동의하지 않음</span>';
  if (c.aiError) return `<span class="badge badge--demo">AI 연결 실패</span> <span class="muted">${esc(c.aiError)}</span>`;
  if (c.seed) return `${stageBadge(c.aiStage)} <span class="badge badge--demo">시연 값</span> <span class="muted">기획서 표 2 판단 기준을 옮긴 값</span>`;
  if (c.demo) return `<span class="badge badge--demo">시연 값</span> <span class="muted">AI를 부르지 못함</span>`;
  return `${stageBadge(c.aiStage)} <span class="badge badge--live">실시간</span> <span class="muted">${esc(c.provider)} · ${esc(c.model)}</span>`;
}

function triedChips(c) {
  if (!c.tried?.length) return '';
  return `<div class="chips">${c.tried.map((t) => `<span class="badge ${t.ok ? 'badge--live' : 'badge--demo'}" title="${esc(t.detail || '')}">${esc(t.provider)} ${t.ok ? '답함' : esc(t.reason)}</span>`).join('')}</div>`;
}

function renderDetail() {
  const c = selected && getComplaint(selected);
  const box = $('#detail');
  if (!c) { box.innerHTML = '<p class="muted">왼쪽 목록에서 민원을 고르세요.</p>'; return; }
  const eff = effectiveStage(c);
  const aiTag = c.aiGenerated ? '<span class="badge badge--ai">AI가 만든 문장</span>' : (c.seed ? '<span class="badge badge--demo">가상 예시</span>' : '<span class="badge badge--demo">시연 값</span>');
  const terms = (c.lexiconHits || []).map((h) => h.term);
  // R4: AI 가 실제로 정상이라고 본 글만 원문을 바로 보여 준다(AI 실패·미표시는 가림)
  const open = isOpenByDefault(c);
  // R2: 열람 전에는 1차 목록 단어 원형 대신 유형과 개수만
  const byType = (c.lexiconHits || []).reduce((m, h) => (h.type ? { ...m, [h.type]: (m[h.type] || 0) + 1 } : m), {});
  const typeText = Object.entries(byType).map(([t, n]) => `${t} ${n}건`).join(' · ') || `${terms.length}건`;
  box.innerHTML = `
    <div class="d-head">
      <div class="d-meta"><span>${esc(c.id)}</span><span>${esc(c.category)}</span><span>${fmt(c.createdAt)} 접수</span></div>
      <h2>${taped(safeTitleOf(c))}</h2>
      <div class="row">
        <span class="small muted">AI 표시</span> ${stageBadge(c.stage)}
        ${c.officerStage ? `<span class="small muted">담당자 확정</span> ${stageBadge(c.officerStage)}` : ''}
        ${c.guideShown ? `<span class="badge">민원인: ${esc(c.citizenChoice)}</span>` : ''}
      </div>
    </div>

    ${c.summary ? `<div class="d-sec"><h3>핵심 요약 ${aiTag}</h3><p class="summary">${taped(c.summary)}</p></div>` : ''}
    ${c.softened && c.stage !== '정상' && (c.aiGenerated || c.seed) ? `<div class="d-sec"><h3>순화본 ${aiTag}</h3><p class="softened prose">${taped(c.softened)}</p></div>` : ''}

    <div class="d-sec">
      <h3>원문</h3>
      ${/* 가림 기준은 AI 가 처음 표시한 단계 — 담당자가 정상으로 바꿔도, AI 표시가 없어도 가린 채 시작(H1·H2) */ ''}
      ${open
        ? `<p class="prose">${highlight(c.original, terms)}</p>`
        : `<div class="veil" id="veil">
            <div class="veil__bars" aria-hidden="true"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
            <div class="veil__cta"><button class="btn btn--sm btn--dark" id="reveal" type="button">원문 보기</button><span class="small muted">${c.stage ? '공격적 표현이 들어 있을 수 있습니다.' : 'AI 표시 없이 접수된 글이라 표현을 살펴보지 못했습니다.'} 열람 기록이 남습니다.</span></div>
          </div>`}
      ${c.firstText ? `<p class="small muted">민원인이 안내 창을 보고 고쳐 낸 글입니다(${esc(c.citizenChoice)}).</p>` : ''}
    </div>

    ${c.stage ? `<div class="d-sec">
      <div class="versus">
        <div><h4>AI 판단 이유</h4><p>${esc(c.reason || '—')}</p></div>
        <div><h4>정상 민원일 수 있는 근거</h4><p>${esc(c.normalReason || '—')}</p></div>
      </div>
    </div>` : ''}

    <div class="d-sec">
      <h3>판단 경로</h3>
      <div class="path">
        <div class="path__row"><span>1차 표현 목록</span><div class="row">${c.lexiconStage ? stageBadge(c.lexiconStage) : '—'} ${terms.length ? `<span class="muted" id="terms">${open ? terms.map(esc).join(', ') : `${esc(typeText)} · 단어는 원문 보기 뒤 표시`}</span>` : ''}</div></div>
        <div class="path__row"><span>2차 AI</span><div class="row">${aiLine(c)}</div></div>
        ${c.tried?.length ? `<div class="path__row"><span>AI 호출 순서</span>${triedChips(c)}</div>` : ''}
        <div class="path__row"><span>결합 규칙</span><span class="muted">두 결과가 같으면 그 단계, 다르면 검토필요</span></div>
      </div>
    </div>

    ${c.stage ? `<div class="d-sec">
      <h3>판단 근거 <span class="badge">답변참고문서 대조</span></h3>
      ${c.basis?.length
        ? `<ul class="basis">${c.basis.map((b) => `<li>${esc(b.doc)} ${esc(b.article)}</li>`).join('')}</ul>${c.basisNote ? `<p class="small muted">${esc(c.basisNote.replace(/\bB\d\b\s*/g, ''))}</p>` : ''}`
        : `<p class="small muted">${esc(c.seed ? '가상 예시라 근거 조문을 고르지 않음' : (c.basisNote || '근거 조문 없음 — 담당자 확인 필요'))}</p>`}
      ${c.basisDropped?.length ? `<p class="small err">AI가 고른 근거 중 답변참고문서에 없는 번호(${c.basisDropped.map(esc).join(', ')})는 뺐습니다.</p>` : ''}
    </div>` : ''}
    ${c.notices?.length ? `<div class="d-sec"><h3>서비스 운영 근거</h3><ul class="basis">${c.notices.map((b) => `<li>${esc(b.doc)} ${esc(b.article)} — ${esc(b.why)}</li>`).join('')}</ul></div>` : ''}

    <div class="d-sec decide">
      <h3>담당자 판단</h3>
      ${c.officerStage ? `<p class="small">${fmt(c.decidedAt)}에 <b>${esc(c.officerStage)}</b>(으)로 ${c.officerStage === c.stage ? '확정' : '변경'}함${c.officerReason ? ` — ${esc(c.officerReason)}` : ''}</p>` : ''}
      ${eff === '차단후보' && c.officerStage ? `<div class="notice-card"><b>민원인 안내</b><span>표현을 가린 상태를 유지한다는 이유를 알리고, 7일 이내 소명 의견을 받을 수 있습니다 [팀 설계안]. 접수 거부·삭제는 하지 않습니다.</span></div>` : ''}
      ${c.objections?.length ? `<div class="notice-card"><b>민원인 소명 의견 — 다시 검토 필요</b>${c.objections.map((o) => `<span>${fmt(o.at)} · ${esc(o.text)}</span>`).join('')}</div>` : ''}
      <div class="row">
        ${c.stage ? `<button class="btn btn--dark" id="confirm" type="button">${esc(c.stage)}(으)로 확정</button>` : ''}
        <button class="btn btn--ghost" id="change" type="button">${c.stage ? '단계 변경' : '단계 정하기'}</button>
      </div>
      <form class="decide__form" id="change-form" hidden>
        <fieldset class="radios"><legend>바꿀 단계</legend>
          ${STAGES.map((s) => `<label><input type="radio" name="stage" value="${s}" ${s === eff ? 'checked' : ''}>${s}</label>`).join('')}
        </fieldset>
        <div class="field" style="margin:0">
          <label for="reason">사유</label>
          <select class="select" id="reason">${CHANGE_REASONS.map((r) => `<option>${r}</option>`).join('')}</select>
        </div>
        <div class="row"><button class="btn btn--dark" type="submit">저장</button><button class="btn" type="button" id="cancel">취소</button></div>
      </form>
    </div>`;

  $('#reveal', box)?.addEventListener('click', () => {
    const v = $('#veil', box);
    v.classList.add('is-open');
    v.innerHTML = `<p class="small muted" style="margin:0 0 6px">제목: ${esc(c.title)}</p><p class="prose" style="margin:0">${highlight(c.original, terms)}</p>
      <div class="veil__cta"><button class="btn btn--sm" id="re-veil" type="button">다시 가리기</button></div>`;
    if ($('#terms', box)) $('#terms', box).textContent = terms.join(', ');
    appendLog({ complaintId: c.id, actor: '담당자', action: '원문 보기', aiStage: c.stage ?? null });
    $('#re-veil', box).addEventListener('click', () => { renderDetail(); $('#reveal', box)?.focus(); });
  });
  $('#confirm', box)?.addEventListener('click', () => { decide(c.id, c.stage, null); snackbar(`${c.stage}(으)로 확정했습니다.`); refresh(); });
  $('#change', box).addEventListener('click', () => { $('#change-form', box).hidden = false; });
  $('#cancel', box).addEventListener('click', () => { $('#change-form', box).hidden = true; });
  $('#change-form', box).addEventListener('submit', (e) => {
    e.preventDefault();
    const stage = $('input[name=stage]:checked', box)?.value;
    if (!stage) return;
    const reason = stage === c.stage ? null : $('#reason', box).value;
    decide(c.id, stage, reason);
    snackbar(stage === c.stage ? `${stage}(으)로 확정했습니다.` : `${stage}(으)로 변경했습니다.`);
    refresh();
  });
}

function refresh() {
  // 고른 민원이 없으면 지금 탭의 첫 민원을 연다
  if (!selected || !getComplaint(selected)) selected = getComplaints().find((c) => bucket(c) === tab)?.id || null;
  renderTabs(); renderList(); renderDetail();
}

$('#q').addEventListener('input', renderList);
$('#sort').addEventListener('change', renderList);
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  selected = getComplaints().find((c) => bucket(c) === tab)?.id || null;
  refresh();
});
function pick(el) {
  selected = el.dataset.id;
  history.replaceState(null, '', `#${selected}`);
  renderList(); renderDetail();
  if (matchMedia('(max-width: 767px)').matches) $('#detail').scrollIntoView({ behavior: 'smooth' });
}
$('#list').addEventListener('click', (e) => { const el = e.target.closest('[data-id]'); if (el) pick(el); });
$('#list').addEventListener('keydown', (e) => {
  const move = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[e.key];
  if (move) {
    e.preventDefault();
    const els = [...document.querySelectorAll('#list [data-id]')];
    const i = els.indexOf(e.target.closest('[data-id]'));
    els[Math.max(0, Math.min(els.length - 1, i + move))]?.focus();
    return;
  }
 const el = e.target.closest('[data-id]'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(el); } });

// 선택된 민원이 있으면 그 탭을 연다
if (selected && getComplaint(selected)) tab = bucket(getComplaint(selected));
refresh();
window.addEventListener('storage', refresh); // 다른 탭에서 접수하면 바로 반영
