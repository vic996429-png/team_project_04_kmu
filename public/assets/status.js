// 처리 상태 보기 — 민원인에게는 내부 단계 이름(정상/검토필요/차단후보)을 보여 주지 않는다
import { addObjection, dueDate, effectiveStage, esc, fmt, getComplaint, seedIfEmpty, snackbar } from './store.js';

seedIfEmpty();
const $ = (s) => document.querySelector(s);
const OBJECTION_DAYS = 7; // 소명 기한 [팀 설계안]
const ymd = (d) => `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;

function render(c) {
  const box = $('#result');
  const decided = Boolean(c.officerStage);
  const masked = decided && effectiveStage(c) === '차단후보';
  const due = dueDate(c.createdAt);
  const objectionUntil = decided ? new Date(new Date(c.decidedAt).getTime() + OBJECTION_DAYS * 864e5) : null;
  const canObject = masked && objectionUntil > new Date();
  const basis = (c.basis || []).map((b) => `「${b.doc.replace(/\s*\(발췌\)$/, '')}」 ${b.article.replace(/\s*\(.*\)$/, '')}`).join(', ');

  box.innerHTML = `
    <h2 id="result-title">${esc(c.title)}</h2>
    <dl class="meta">
      <div><dt>접수번호</dt><dd>${esc(c.id)}</dd></div>
      <div><dt>접수일</dt><dd>${fmt(c.createdAt)}</dd></div>
      <div><dt>처리 기한</dt><dd>${ymd(due)}까지 <span class="small muted">(주말 제외 7일, 공휴일은 반영하지 않음)</span></dd></div>
    </dl>
    <ol class="steps" aria-label="처리 단계">
      <li data-state="done"><b>접수</b><span>${fmt(c.createdAt)}</span></li>
      <li data-state="${decided ? 'done' : 'now'}" ${decided ? '' : 'aria-current="step"'}><b>담당자 확인</b><span>${decided ? `${fmt(c.decidedAt)} 확인함` : '확인 중'}</span></li>
      <li data-state="${decided ? 'now' : 'later'}" ${decided ? 'aria-current="step"' : ''}><b>처리 결과 회신</b><span>담당 부서가 회신합니다</span></li>
    </ol>
    ${masked ? `<div class="objection">
      <p><b>일부 표현을 가린 채 처리합니다.</b></p>
      <p>담당 공무원을 보호하기 위해 글의 일부 표현을 가린 상태로 담당 부서에 전달했습니다. 민원은 그대로 접수되어 처리됩니다.${basis ? ` 근거: ${esc(basis)}.` : ''}</p>
      ${canObject
        ? `<p class="small">이 결정에 의견이 있으면 ${ymd(objectionUntil)}까지 소명 의견을 낼 수 있습니다. 담당자가 다시 검토합니다. (기한 7일은 [팀 설계안])</p>
           <label class="sr-only" for="obj">소명 의견</label>
           <textarea class="textarea" id="obj" maxlength="1000" placeholder="가린 표현이 필요했던 이유나 사정을 적어 주세요."></textarea>
           <div><button class="btn btn--brand" id="send-obj" type="button">소명 의견 보내기</button></div>`
        : `<p class="small muted">소명 의견 기한(${objectionUntil ? ymd(objectionUntil) : '—'})이 지났습니다.</p>`}
      ${(c.objections || []).map((o) => `<p class="small">보낸 의견(${fmt(o.at)}): ${esc(o.text)}</p>`).join('')}
    </div>` : ''}`;
  box.hidden = false;
  box.focus();

  $('#send-obj')?.addEventListener('click', () => {
    const v = $('#obj').value.trim();
    if (!v) { $('#obj').focus(); snackbar('소명 의견을 적어 주세요.'); return; }
    render(addObjection(c.id, v));
    snackbar('소명 의견을 보냈습니다.');
  });
}

function lookup(id) {
  const err = $('#rid-err');
  const input = $('#rid');
  err.textContent = '';
  input.removeAttribute('aria-invalid');
  const c = getComplaint(id.trim());
  if (!c) {
    err.textContent = '이 브라우저에서 해당 접수번호를 찾지 못했습니다. 번호를 다시 확인해 주세요.';
    input.setAttribute('aria-invalid', 'true');
    $('#result').hidden = true;
    input.focus();
    return;
  }
  history.replaceState(null, '', `?id=${encodeURIComponent(c.id)}`);
  render(c);
}

$('#lookup').addEventListener('submit', (e) => { e.preventDefault(); lookup($('#rid').value); });
const q = new URLSearchParams(location.search).get('id');
if (q) { $('#rid').value = q; lookup(q); }
