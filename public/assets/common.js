// 모든 화면 공통 — 글자 크기 조절(저장), 본문 바로가기 이동.
(() => {
  const KEY = 'sb.font';
  const SIZES = [['', '글자 크기: 보통'], ['l', '글자 크기: 크게'], ['xl', '글자 크기: 아주 크게']];
  const get = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const apply = (v) => { if (v) document.documentElement.dataset.font = v; else delete document.documentElement.dataset.font; };
  apply(get());
  document.addEventListener('DOMContentLoaded', () => {
    const inner = document.querySelector('.topbar__inner');
    if (inner) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'fsz';
      const paint = () => {
        const i = SIZES.findIndex(([v]) => v === get());
        b.textContent = '가';
        b.dataset.level = String(i < 0 ? 0 : i);
        b.setAttribute('aria-label', `${SIZES[i < 0 ? 0 : i][1]}. 누르면 글자가 커집니다`);
        b.title = SIZES[i < 0 ? 0 : i][1];
      };
      b.addEventListener('click', () => {
        const i = SIZES.findIndex(([v]) => v === get());
        const next = SIZES[((i < 0 ? 0 : i) + 1) % SIZES.length][0];
        try { localStorage.setItem(KEY, next); } catch {}
        apply(next); paint();
      });
      paint(); inner.appendChild(b);
    }
    const skip = document.querySelector('.skip');
    skip?.addEventListener('click', () => { const m = document.querySelector('#main'); if (m) { m.setAttribute('tabindex', '-1'); m.focus(); } });
  });
})();

// 안내 챗봇 — 모든 화면 오른쪽 아래 「물어보기」. /api/chat 이 답변참고문서에서만 답한다.
(() => {
  const EXAMPLES = ['욕설이 있어도 접수가 되나요?', '처리 기간은 며칠인가요?', '악성 민원이면 어떻게 되나요?', '내 개인정보는 AI에 어떻게 보내나요?'];
  document.addEventListener('DOMContentLoaded', () => {
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const fab = el('button', 'chat-fab', '물어보기');
    fab.type = 'button'; fab.setAttribute('aria-haspopup', 'dialog'); fab.setAttribute('aria-expanded', 'false');
    const panel = el('section', 'chat'); panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '안내 챗봇');
    const head = el('div', 'chat__head');
    head.append(el('strong', '', '안내 도우미'), el('span', 'chat__sub', '답변참고문서의 내용으로만 답해요'));
    const close = el('button', 'chat__close', '닫기'); close.type = 'button'; head.append(close);
    const log = el('div', 'chat__log'); log.setAttribute('role', 'log'); log.tabIndex = 0; log.setAttribute('aria-live', 'polite');
    const chips = el('div', 'chat__chips');
    const form = el('form', 'chat__form');
    const input = el('input'); input.type = 'text'; input.maxLength = 300; input.placeholder = '궁금한 점을 적어 주세요'; input.setAttribute('aria-label', '질문');
    const send = el('button', 'chat__send', '보내기'); send.type = 'submit';
    form.append(input, send);
    panel.append(head, log, chips, form);
    document.body.append(fab, panel);

    const say = (who, text) => { const b = el('div', `chat__msg chat__msg--${who}`); b.append(el('p', '', text)); log.append(b); log.scrollTop = log.scrollHeight; return b; };
    const open = () => { panel.hidden = false; fab.setAttribute('aria-expanded', 'true'); if (!log.children.length) say('bot', '성북 안심 민원 필터에 대해 물어보세요. 어떤 글도 접수되고, 단계는 담당 공무원이 정해요.'); input.focus(); };
    const shut = () => { panel.hidden = true; fab.setAttribute('aria-expanded', 'false'); fab.focus(); };
    fab.addEventListener('click', () => (panel.hidden ? open() : shut()));
    close.addEventListener('click', shut);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') shut(); });
    for (const q of EXAMPLES) { const c = el('button', 'chat__chip', q); c.type = 'button'; c.addEventListener('click', () => ask(q)); chips.append(c); }
    form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });

    async function ask(question) {
      const q = String(question || '').trim();
      if (!q) return;
      input.value = ''; say('me', q);
      const wait = say('bot', '문서를 찾는 중이에요…'); send.disabled = true;
      try {
        const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || '답을 가져오지 못했어요');
        wait.replaceChildren(el('p', '', d.answer));
        if (d.aiGenerated) wait.append(el('p', 'chat__tag', 'AI가 만든 문장이에요. 정확한 내용은 아래 근거로 확인하세요.'));
        for (const x of d.excerpts || []) { const b = el('blockquote', 'chat__quote'); b.append(el('strong', '', `${x.doc} · ${x.article}`), el('span', '', x.text)); wait.append(b); }
        if (d.sources?.length && !d.excerpts) wait.append(el('p', 'chat__src', `근거: ${d.sources.map((s) => `${s.doc} ${s.article}`).join(' / ')}`));
      } catch (err) {
        wait.replaceChildren(el('p', '', `${err.message}. 잠시 뒤 다시 물어봐 주세요. 급하면 성북구청 감사담당관 02-2241-4901/2185로 문의하세요.`));
      } finally { send.disabled = false; log.scrollTop = Math.max(0, wait.offsetTop - log.offsetTop - 8); input.focus(); }
    }
  });
})();
