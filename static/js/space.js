// ---------- Personal Space: 3D intro (plays once per tab session, skippable) ----------
(function () {
    const root = document.getElementById('spIntro');
    if (!root) return;
    const kind = root.dataset.kind;                       // 'login' | 'dashboard'
    const KEY = 'spIntro-' + kind;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seen = false;
    try { seen = sessionStorage.getItem(KEY) === '1'; } catch (e) { }

    // pressing "Lock" should bring the intro back on the next visit
    document.querySelectorAll('form[action$="/logout"]').forEach(f => f.addEventListener('submit', () => {
        try { sessionStorage.removeItem('spIntro-login'); sessionStorage.removeItem('spIntro-dashboard'); } catch (e) { }
    }));

    if (reduce || seen) { root.remove(); return; }          // no intro -> no entrance animation either
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { }

    const line = document.getElementById('spIntroLine');
    const bar = root.querySelector('.sp-intro-bar i');
    const T = kind === 'login' ? { grant: 1100, open: 1650, done: 2150, end: 2900 } : { grant: 1700, open: 2350, done: 2900, end: 3700 };
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));

    requestAnimationFrame(() => {
        root.classList.add('is-in');
        bar.style.transitionDuration = T.grant + 'ms';
        bar.style.width = '100%';
    });
    at(T.grant, () => { root.classList.add('is-granted'); line.textContent = root.dataset.granted; });
    at(T.open, () => { root.classList.add('is-open'); document.body.classList.add('sp-entered'); });
    at(T.done, () => root.classList.add('is-done'));
    at(T.end, () => root.remove());

    function skip() {
        if (!document.body.contains(root) || root.classList.contains('is-open')) return;
        timers.forEach(clearTimeout);
        root.classList.add('is-granted', 'is-open'); line.textContent = root.dataset.granted;
        document.body.classList.add('sp-entered');
        setTimeout(() => root.classList.add('is-done'), 350);
        setTimeout(() => root.remove(), 1100);
    }
    document.getElementById('spIntroSkip').addEventListener('click', e => { e.stopPropagation(); skip(); });
    root.addEventListener('click', skip);
    document.addEventListener('keydown', e => { if (['Escape', 'Enter', ' '].includes(e.key)) skip(); });
})();