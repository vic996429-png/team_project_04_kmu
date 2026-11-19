// 관리·감독 화면 — 지표(기획서 3.7), 오분류 사례, 판단 이력, AI 표시 일시 중지, 연결 상태
import { api, esc, fmt, safeTitleOf, getComplaints, getLog, isManual, seedIfEmpty, setManual, snackbar, stageBadge, verifyLog } from './store.js';

seedIfEmpty();
const $ = (s) => document.querySelector(s);
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');

function renderSwitch() {
  const on = !isManual();
  $('#ai-on').checked = on;
  $('#ai-on-label').textContent = on ? '켜짐' : '꺼짐(수동 처리)';
  $('#manual-desc').textContent = on
    ? '민원 접수 때 AI가 단계를 표시합니다. 끄면 새 민원은 AI 표시 없이 담당자에게 갑니다.'
    : 'AI 표시를 멈춘 상태입니다. 새 민원은 「AI 미표시」로 담당자 현황판에 들어갑니다.';
}
// H9: 스위치를 바로 바꾸지 않고 확인 창에서 사유를 고른 뒤 바꾼다. 사유는 판단 이력에 남는다
const REASONS = {
  stop: ['담당자 판단 변경률이 높아짐', 'AI 응답 오류·지연', '시스템 점검', '기타'],
  start: ['원인 확인·조치 완료', '점검 종료', '기타'],
};
let wantOn = null;
$('#ai-on').addEventListener('change', (e) => {
  wantOn = e.target.checked;
  e.target.checked = !wantOn; // 확인 전까지는 원래 상태 유지
  $('#ai-dialog-title').textContent = wantOn ? 'AI 표시를 다시 켤까요?' : 'AI 표시를 멈출까요?';
  $('#ai-dialog-desc').textContent = wantOn
    ? '켜면 새로 접수되는 민원부터 AI가 단계를 표시합니다.'
    : '멈추면 새 민원은 AI 표시 없이 「AI 미표시」로 담당자 현황판에 들어가고, 원문은 가린 채 보입니다. 이미 접수된 민원은 바뀌지 않습니다.';
  $('#ai-reason').innerHTML = '<option value="">사유를 고르세요</option>' + REASONS[wantOn ? 'start' : 'stop'].map((r) => `<option>${r}</option>`).join('');
  $('#ai-reason-etc').hidden = true; $('#ai-reason-etc').value = '';
  $('#ai-reason-err').textContent = '';
  $('#ai-ok').textContent = wantOn ? '다시 켜기' : '멈추기';
  $('#ai-dialog').showModal();
});
$('#ai-reason').addEventListener('change', (e) => { $('#ai-reason-etc').hidden = e.target.value !== '기타'; });
$('#ai-cancel').addEventListener('click', () => $('#ai-dialog').close());
$('#ai-form').addEventListener('submit', (e) => {
  const sel = $('#ai-reason').value;
  const reason = sel === '기타' ? $('#ai-reason-etc').value.trim() : sel;
  if (!reason) {
    e.preventDefault();
    $('#ai-reason-err').textContent = '사유를 골라 주세요.';
    (sel === '기타' ? $('#ai-reason-etc') : $('#ai-reason')).focus();
    return;
  }
  setManual(!wantOn, reason);
  renderSwitch(); renderLog();
  snackbar(wantOn ? 'AI 표시를 다시 켰습니다.' : 'AI 표시를 멈췄습니다.');
  setTimeout(() => $('#ai-on').focus(), 0);
});

function renderStats() {
  const list = getComplaints();
  const marked = list.filter((c) => c.stage);
  const by = (s) => marked.filter((c) => c.stage === s).length;
  const decided = list.filter((c) => c.officerStage && c.stage);
  const changed = decided.filter((c) => c.officerStage !== c.stage);
  const shown = list.filter((c) => c.guideShown);
  const revised = shown.filter((c) => c.citizenChoice === '제안대로 고치기' || c.citizenChoice === '직접 고치기');
  const tiles = [
    ['전체 접수', list.length, `AI 미표시 ${list.length - marked.length}건`],
    ['<span class="dot dot--normal"></span>정상', by('정상'), 'AI 표시 기준'],
    ['<span class="dot dot--review"></span>검토필요', by('검토필요'), 'AI 표시 기준'],
    ['<span class="dot dot--block"></span>차단후보', by('차단후보'), 'AI 표시 기준'],
    ['판단 변경률', pct(changed.length, decided.length), `변경 ${changed.length} ÷ 담당자 판단 ${decided.length}`],
    ['수정 수용률', pct(revised.length, shown.length), `고쳐 냄 ${revised.length} ÷ 안내 창 ${shown.length}`],
  ];
  $('#stats').innerHTML = tiles.map(([l, v, n]) => `<div class="stat"><span class="stat__label">${l}</span><span class="stat__value">${v}</span><span class="stat__note">${n}</span></div>`).join('');

  $('#mis').innerHTML = changed.length
    ? `<ul class="mis">${changed.map((c) => `<li><a href="/officer#${esc(c.id)}">${esc(safeTitleOf(c))}</a><div class="row">AI ${stageBadge(c.stage)} → 담당자 ${stageBadge(c.officerStage)}</div><span class="muted">${esc(c.officerReason || '')}</span></li>`).join('')}</ul>`
    : '<p class="small muted">아직 없습니다. 담당자 현황판에서 단계를 바꾸면 여기에 모입니다.</p>';

  const count = {};
  for (const c of list) {
    const k = c.seed ? '시연 데이터' : c.provider || (c.manual ? 'AI 중지 중' : c.aiConsent === false ? 'AI 미동의' : c.stage ? '시연 값(AI 실패)' : 'AI 연결 실패');
    count[k] = (count[k] || 0) + 1;
  }
  const max = Math.max(1, ...Object.values(count));
  $('#providers').innerHTML = `<div class="bars">${Object.entries(count).map(([k, n]) => `<div class="bar"><span>${esc(k)}</span><span class="bar__track"><span class="bar__fill" style="width:${(n / max) * 100}%"></span></span><span class="num">${n}건</span></div>`).join('')}</div>`;
}

function renderLog() {
  const v = verifyLog();
  $('#integrity').innerHTML = v.ok ? '<span class="badge badge--normal">지문 일치</span>' : `<span class="badge badge--block">${v.at}번째 줄부터 변조 의심</span>`;
  const rows = getLog().slice(-50).reverse();
  $('#log').innerHTML = rows.map((r) => `<tr>
    <td class="num">${r.seq}</td><td class="num">${fmt(r.at)}</td><td>${esc(r.complaintId || '—')}</td><td>${esc(r.actor)}</td>
    <td>${esc(r.action)}${r.choice ? ` · ${esc(r.choice)}` : ''}</td>
    <td>${r.fromStage ? `${esc(r.fromStage)} → ` : ''}${r.toStage ? esc(r.toStage) : ''}</td>
    <td>${esc(r.reason || '')}${r.provider ? `${esc(r.provider)}${r.model ? ` · ${esc(r.model)}` : ''}` : ''}</td>
  </tr>`).join('') || '<tr><td colspan="7" class="muted">이력이 없습니다.</td></tr>';
}

async function renderTrend() {
  try {
    const r = await api('/api/trend');
    const head = r.live ? '<span class="badge badge--live">실시간</span>' : `<span class="badge badge--demo">시연 값</span> <span class="small muted">${esc(r.reason)}${r.detail ? ` · ${esc(r.detail)}` : ''}</span>`;
    if (r.live) { $('#trend').innerHTML = `<div class="row">${head}</div><pre class="small">${esc(JSON.stringify(r.raw, null, 2).slice(0, 1200))}</pre>`; return; }
    const max = Math.max(...r.demo.items.map((i) => i.count));
    $('#trend').innerHTML = `<div class="row" style="margin-bottom:12px">${head}</div>
      <div class="bars">${r.demo.items.map((i) => `<div class="bar"><span>${esc(i.label)}</span><span class="bar__track"><span class="bar__fill" style="width:${(i.count / max) * 100}%"></span></span><span class="num">${i.count}</span></div>`).join('')}</div>
      <p class="small muted">${esc(r.demo.note)} · ${esc(r.demo.period)}</p>`;
  } catch (e) {
    $('#trend').innerHTML = `<p class="err">불러오지 못했습니다: ${esc(e.message)}</p>`;
  }
}

async function renderKeys() {
  try {
    const { keys } = await api('/api/status');
    $('#keys').innerHTML = keys.map((k) => `<tr><td><code>${esc(k.env)}</code></td><td>${esc(k.use)}</td><td>${k.set ? '<span class="badge badge--normal">값 있음</span>' : '<span class="badge badge--demo">비어 있음</span>'}</td></tr>`).join('');
  } catch (e) {
    $('#keys').innerHTML = `<tr><td colspan="3" class="err">서버에 연결하지 못했습니다: ${esc(e.message)}</td></tr>`;
  }
}

$('#reset').addEventListener('click', () => {
  if (!confirm('이 브라우저의 민원 목록을 가상 예시 10건으로 되돌릴까요? 판단 이력은 지우지 않습니다.')) return;
  seedIfEmpty(true);
  renderAll();
  snackbar('시연 데이터를 초기화했습니다.');
});

function renderAll() { renderSwitch(); renderStats(); renderLog(); }
renderAll();
renderTrend();
renderKeys();
window.addEventListener('storage', renderAll);
