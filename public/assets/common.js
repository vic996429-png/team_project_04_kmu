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
