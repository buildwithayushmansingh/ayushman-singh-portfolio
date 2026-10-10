// ---------- Personal Space: private dashboard (notes, goals, habit tracker) ----------
(function () {
    const body = document.body;
    const CSRF = body.dataset.csrf, API = body.dataset.api, LOGIN = body.dataset.login;
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

    const isoLocal = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); };
    const TODAY = isoLocal(new Date());
    let S = { notes: [], goals: [], habits: [], today: TODAY };

    /* ---------- helpers ---------- */
    let toastTimer;
    function toast(msg) {
        const t = $('#toast'); t.textContent = msg; t.hidden = false;
        clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
    }
    async function api(method, path, data) {
        const res = await fetch(API + path, {
            method, credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF },
            body: data ? JSON.stringify(data) : undefined
        });
        if (res.status === 401) { location.href = LOGIN; throw new Error('auth'); }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { toast(json.error || 'Something went wrong.'); throw new Error(json.error || String(res.status)); }
        return json;
    }
    function ago(iso) {
        const s = (Date.now() - new Date(iso).getTime()) / 1000;
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        if (s < 604800) return Math.floor(s / 86400) + 'd ago';
        return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }
    function streaks(days, today) {
        const set = new Set(days);
        let d = set.has(today) ? today : addDays(today, -1), cur = 0;
        while (set.has(d)) { cur++; d = addDays(d, -1); }
        let best = 0, run = 0, prev = null;
        Array.from(set).sort().forEach(x => {
            run = prev && (new Date(x) - new Date(prev)) / 864e5 === 1 ? run + 1 : 1;
            best = Math.max(best, run); prev = x;
        });
        return { streak: cur, best };
    }
    const goalProgress = g => {
        if (g.status === 'done') return 100;
        const t = g.milestones.length;
        return t ? Math.round(g.milestones.filter(m => m.done).length / t * 100) : 0;
    };
    const activeHabits = () => S.habits.filter(h => !h.archived);
    const noteTitle = n => n.title || (n.body.split('\n')[0] || '').slice(0, 60) || 'Untitled note';

    /* ---------- navigation ---------- */
    const TITLES = {
        overview: ['Overview', () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })],
        notes: ['Notes', () => S.notes.length + ' note' + (S.notes.length === 1 ? '' : 's')],
        goals: ['Goals', () => S.goals.filter(g => g.status === 'active').length + ' active'],
        tracker: ['Habit tracker', () => 'Small things, every day'],
        backup: ['Backup', () => 'Export or restore your data']
    };
    async function leaveNotes() {
        await flushSave(); await dropIfEmpty(); closeEditor(); renderAll();
    }
    function show(view) {
        if (!TITLES[view]) view = 'overview';
        if (view !== 'notes' && currentNote) leaveNotes();
        $$('.sp-view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + view));
        $$('.sp-nav-btn').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
        $('#spTitle').textContent = TITLES[view][0];
        $('#spSub').textContent = TITLES[view][1]();
        if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
        window.scrollTo(0, 0);
    }
    $('#spNav').addEventListener('click', e => { const b = e.target.closest('.sp-nav-btn'); if (b) show(b.dataset.view); });
    $('#spTheme').addEventListener('click', () => {
        const order = ['cinematic', 'light', 'terminal'];
        const cur = document.documentElement.getAttribute('data-theme') || 'cinematic';
        const next = order[(order.indexOf(cur) + 1) % order.length];
        if (next === 'cinematic') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('siteTheme', next); } catch (e) { }
    });

    /* ---------- habits ---------- */
    async function toggleHabit(h, day) {
        const had = h.days.includes(day), delta = had ? -1 : 1;
        h.days = had ? h.days.filter(d => d !== day) : h.days.concat(day).sort();
        h.total += delta;
        Object.assign(h, streaks(h.days, S.today));
        renderAll();
        try { await api('POST', '/habits/' + h.id + '/toggle', { day }); }
        catch (e) { h.days = had ? h.days.concat(day).sort() : h.days.filter(d => d !== day); h.total -= delta; Object.assign(h, streaks(h.days, S.today)); renderAll(); }
    }
    function habitRow(h) {
        const row = el('div', 'sp-habit' + (h.archived ? ' is-archived' : ''));
        const info = el('div', 'sp-habit-info');
        info.append(el('div', 'sp-habit-name', h.name), el('div', 'sp-habit-meta', '🔥 ' + h.streak + '-day streak · best ' + h.best + ' · ' + h.total + ' total'));
        const dots = el('div', 'sp-dots');
        for (let i = 13; i >= 0; i--) {
            const day = addDays(S.today, -i);
            const b = el('button', 'sp-dot' + (h.days.includes(day) ? ' is-on' : '') + (i === 0 ? ' is-today' : ''));
            b.type = 'button'; b.title = day; b.setAttribute('aria-label', h.name + ' on ' + day);
            b.addEventListener('click', () => toggleHabit(h, day));
            dots.appendChild(b);
        }
        const tools = el('div', 'sp-habit-tools');
        const arch = el('button', 'sp-link-btn', h.archived ? 'Restore' : 'Archive'); arch.type = 'button';
        arch.addEventListener('click', async () => { await api('PUT', '/habits/' + h.id, { archived: !h.archived }); h.archived = !h.archived; renderAll(); });
        const del = el('button', 'sp-link-btn is-danger', 'Delete'); del.type = 'button';
        del.addEventListener('click', async () => {
            if (!confirm('Delete "' + h.name + '" and its history?')) return;
            await api('DELETE', '/habits/' + h.id); S.habits = S.habits.filter(x => x.id !== h.id); renderAll();
        });
        tools.append(arch, del);
        row.append(info, dots, tools);
        return row;
    }
    function renderTracker() {
        const list = $('#habitList'); list.textContent = '';
        if (!S.habits.length) list.appendChild(el('div', 'sp-empty-inline', 'No habits yet — add your first one above.'));
        else { const card = el('div', 'sp-card'); S.habits.forEach(h => card.appendChild(habitRow(h))); list.appendChild(card); }
        // aggregate heatmap: share of active habits done per day, 12 weeks, Sunday-first columns
        const heat = $('#heat'); heat.textContent = '';
        const act = activeHabits();
        const start = new Date(S.today + 'T00:00:00'); start.setDate(start.getDate() - start.getDay() - 77);
        for (let i = 0; i < 84; i++) {
            const d = new Date(start); d.setDate(start.getDate() + i);
            const day = isoLocal(d), cell = el('i', 'sp-heat-cell');
            if (day > S.today) cell.classList.add('is-future');
            else {
                const done = act.filter(h => h.days.includes(day)).length;
                const r = act.length ? done / act.length : 0;
                cell.classList.add('l' + (done === 0 ? 0 : r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.75 ? 3 : 4));
                cell.title = day + ': ' + done + '/' + act.length;
            }
            heat.appendChild(cell);
        }
    }
    $('#habitForm').addEventListener('submit', async e => {
        e.preventDefault();
        const input = $('#habitName'), name = input.value.trim();
        if (!name) return;
        await api('POST', '/habits', { name }); input.value = ''; await load();
    });

    /* ---------- notes ---------- */
    let currentNote = null, saveTimer = null;
    function filteredNotes() {
        const q = $('#noteSearch').value.trim().toLowerCase(), tag = $('#noteTagFilter').value;
        return S.notes.filter(n => (!tag || n.tag === tag) && (!q || (n.title + ' ' + n.body + ' ' + n.tag).toLowerCase().includes(q)));
    }
    function sortNotes() { S.notes.sort((a, b) => (b.pinned - a.pinned) || (b.updated > a.updated ? 1 : -1)); }
    function renderTagFilter() {
        const sel = $('#noteTagFilter'), keep = sel.value;
        const tags = Array.from(new Set(S.notes.map(n => n.tag).filter(Boolean))).sort();
        sel.textContent = ''; sel.appendChild(Object.assign(el('option', null, 'All tags'), { value: '' }));
        tags.forEach(t => sel.appendChild(Object.assign(el('option', null, '#' + t), { value: t })));
        sel.value = tags.includes(keep) ? keep : '';
    }
    function renderNoteList() {
        const list = $('#noteList'); list.textContent = '';
        const notes = filteredNotes();
        if (!notes.length) list.appendChild(el('div', 'sp-empty-inline', S.notes.length ? 'No notes match.' : 'No notes yet.'));
        notes.forEach(n => {
            const item = el('button', 'sp-note-item' + (currentNote && currentNote.id === n.id ? ' is-active' : ''));
            item.type = 'button';
            const top = el('div', 'sp-note-top');
            top.append(el('span', 'sp-note-title', (n.pinned ? '📌 ' : '') + noteTitle(n)), el('span', 'sp-note-time', ago(n.updated)));
            const prev = el('div', 'sp-note-prev', n.body.replace(/\s+/g, ' ').slice(0, 90));
            item.append(top, prev);
            if (n.tag) item.appendChild(el('span', 'sp-chip', '#' + n.tag));
            item.addEventListener('click', () => openNote(n));
            list.appendChild(item);
        });
        updateSub();
    }
    async function dropIfEmpty() {
        const n = currentNote;
        if (n && !n.title && !n.body && !n.tag) {
            S.notes = S.notes.filter(x => x.id !== n.id);
            try { await api('DELETE', '/notes/' + n.id); } catch (e) { }
        }
    }
    async function openNote(n) {
        if (currentNote && currentNote.id !== n.id) { await flushSave(); await dropIfEmpty(); }
        currentNote = n;
        $('#noteTitle').value = n.title; $('#noteTag').value = n.tag; $('#noteBody').value = n.body;
        $('#notePin').textContent = n.pinned ? 'Unpin' : 'Pin';
        $('#noteStatus').textContent = '';
        $('#noteEditor').hidden = false; $('#noteEmpty').hidden = true;
        $('#notesWrap').classList.add('is-editing');
        renderNoteList();
    }
    function closeEditor() {
        currentNote = null; $('#noteEditor').hidden = true; $('#noteEmpty').hidden = false;
        $('#notesWrap').classList.remove('is-editing'); renderNoteList();
    }
    async function flushSave() {
        if (!saveTimer || !currentNote) return;
        clearTimeout(saveTimer); saveTimer = null; await saveNote();
    }
    async function saveNote() {
        saveTimer = null;
        const n = currentNote; if (!n) return;
        const patch = { title: $('#noteTitle').value, tag: $('#noteTag').value, body: $('#noteBody').value };
        $('#noteStatus').textContent = 'Saving…';
        try {
            const saved = await api('PUT', '/notes/' + n.id, patch);
            Object.assign(n, saved); sortNotes(); renderTagFilter(); renderNoteList(); renderOverview();
            $('#noteStatus').textContent = 'Saved ✓';
        } catch (e) { $('#noteStatus').textContent = 'Not saved'; }
    }
    function queueSave() { $('#noteStatus').textContent = 'Typing…'; clearTimeout(saveTimer); saveTimer = setTimeout(saveNote, 700); }
    ['#noteTitle', '#noteTag', '#noteBody'].forEach(s => $(s).addEventListener('input', queueSave));
    $('#noteSearch').addEventListener('input', renderNoteList);
    $('#noteTagFilter').addEventListener('change', renderNoteList);
    $('#noteBack').addEventListener('click', async () => { await flushSave(); await dropIfEmpty(); closeEditor(); renderAll(); });
    $('#noteNew').addEventListener('click', async () => {
        await flushSave(); await dropIfEmpty();
        const n = await api('POST', '/notes', { title: '', body: '', tag: '' });
        S.notes.unshift(n); sortNotes(); await openNote(n); $('#noteTitle').focus();
    });
    $('#notePin').addEventListener('click', async () => {
        const n = currentNote; if (!n) return;
        const saved = await api('PUT', '/notes/' + n.id, { pinned: !n.pinned });
        Object.assign(n, saved); sortNotes(); $('#notePin').textContent = n.pinned ? 'Unpin' : 'Pin'; renderNoteList(); renderOverview();
    });
    $('#noteDel').addEventListener('click', async () => {
        const n = currentNote; if (!n || !confirm('Delete this note?')) return;
        clearTimeout(saveTimer); saveTimer = null;
        await api('DELETE', '/notes/' + n.id); S.notes = S.notes.filter(x => x.id !== n.id); currentNote = null;
        closeEditor(); renderAll();
    });
    $('#quickForm').addEventListener('submit', async e => {
        e.preventDefault();
        const input = $('#quickInput'), text = input.value.trim(); if (!text) return;
        const n = await api('POST', '/notes', { title: '', body: text, tag: 'quick' });
        S.notes.unshift(n); sortNotes(); input.value = ''; toast('Note added'); renderAll();
    });

    /* ---------- goals ---------- */
    let goalFilter = 'active', editingGoal = null;
    function daysLeft(g) {
        if (!g.target_date || g.status === 'done') return '';
        const d = Math.round((new Date(g.target_date + 'T00:00:00') - new Date(S.today + 'T00:00:00')) / 864e5);
        return d > 0 ? d + ' day' + (d === 1 ? '' : 's') + ' left' : d === 0 ? 'Due today' : 'Overdue by ' + (-d) + ' day' + (d === -1 ? '' : 's');
    }
    async function patchGoal(g, patch) { Object.assign(g, await api('PUT', '/goals/' + g.id, patch)); renderAll(); }
    function goalCard(g) {
        const card = el('div', 'sp-card sp-goal' + (g.status === 'done' ? ' is-done' : ''));
        const head = el('div', 'sp-goal-head');
        head.append(el('h3', 'sp-goal-title', g.title));
        const left = daysLeft(g); if (left) head.appendChild(el('span', 'sp-chip' + (left.startsWith('Overdue') ? ' is-bad' : ''), left));
        card.appendChild(head);
        if (g.description) card.appendChild(el('p', 'sp-muted', g.description));
        const pct = goalProgress(g), bar = el('div', 'sp-bar'), fill = el('i'); fill.style.width = pct + '%'; bar.appendChild(fill);
        card.append(bar, el('div', 'sp-bar-label', pct + '% complete'));
        const ms = el('div', 'sp-miles');
        g.milestones.forEach((m, i) => {
            const lab = el('label', 'sp-mile' + (m.done ? ' is-done' : ''));
            const cb = el('input'); cb.type = 'checkbox'; cb.checked = m.done;
            cb.addEventListener('change', () => { const next = g.milestones.map((x, j) => j === i ? { text: x.text, done: cb.checked } : x); patchGoal(g, { milestones: next }); });
            lab.append(cb, el('span', null, m.text)); ms.appendChild(lab);
        });
        card.appendChild(ms);
        const add = el('form', 'sp-row sp-mile-add'), inp = el('input', 'sp-input'); inp.placeholder = 'Add milestone…'; inp.maxLength = 120;
        const addBtn = el('button', 'sp-btn sp-btn-ghost', 'Add'); addBtn.type = 'submit'; add.append(inp, addBtn);
        add.addEventListener('submit', e => { e.preventDefault(); const t = inp.value.trim(); if (t) patchGoal(g, { milestones: g.milestones.concat({ text: t, done: false }) }); });
        card.appendChild(add);
        const tools = el('div', 'sp-habit-tools');
        const done = el('button', 'sp-link-btn', g.status === 'done' ? 'Reopen' : 'Mark complete'); done.type = 'button';
        done.addEventListener('click', () => patchGoal(g, { status: g.status === 'done' ? 'active' : 'done' }));
        const edit = el('button', 'sp-link-btn', 'Edit'); edit.type = 'button'; edit.addEventListener('click', () => openGoalForm(g));
        const del = el('button', 'sp-link-btn is-danger', 'Delete'); del.type = 'button';
        del.addEventListener('click', async () => { if (!confirm('Delete this goal?')) return; await api('DELETE', '/goals/' + g.id); S.goals = S.goals.filter(x => x.id !== g.id); renderAll(); });
        tools.append(done, edit, del); card.appendChild(tools);
        return card;
    }
    function renderGoals() {
        const list = $('#goalList'); list.textContent = '';
        const goals = S.goals.filter(g => g.status === goalFilter);
        if (!goals.length) list.appendChild(el('div', 'sp-empty-inline', goalFilter === 'active' ? 'No active goals — set one!' : 'Nothing completed yet.'));
        goals.forEach(g => list.appendChild(goalCard(g)));
    }
    function openGoalForm(g) {
        editingGoal = g || null;
        $('#goalFormTitle').textContent = g ? 'Edit goal' : 'New goal';
        $('#goalTitle').value = g ? g.title : ''; $('#goalDesc').value = g ? g.description : '';
        $('#goalDate').value = g ? g.target_date : ''; $('#goalMilestones').value = g ? g.milestones.map(m => m.text).join('\n') : '';
        $('#goalForm').hidden = false; $('#goalTitle').focus();
        $('#goalForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    $('#goalNew').addEventListener('click', () => openGoalForm(null));
    $('#goalCancel').addEventListener('click', () => { $('#goalForm').hidden = true; });
    $('#goalTabs').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        goalFilter = b.dataset.filter; $$('#goalTabs button').forEach(x => x.classList.toggle('is-active', x === b)); renderGoals();
    });
    $('#goalForm').addEventListener('submit', async e => {
        e.preventDefault();
        const old = editingGoal ? new Map(editingGoal.milestones.map(m => [m.text, m.done])) : new Map();
        const milestones = $('#goalMilestones').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30).map(t => ({ text: t, done: old.get(t) || false }));
        const payload = { title: $('#goalTitle').value, description: $('#goalDesc').value, target_date: $('#goalDate').value, milestones };
        if (editingGoal) Object.assign(editingGoal, await api('PUT', '/goals/' + editingGoal.id, payload));
        else S.goals.push(await api('POST', '/goals', payload));
        $('#goalForm').hidden = true; await load();
    });

    /* ---------- overview ---------- */
    function renderOverview() {
        const act = activeHabits(), doneToday = act.filter(h => h.days.includes(S.today)).length;
        $('#stNotes').textContent = S.notes.length;
        $('#stGoals').textContent = S.goals.filter(g => g.status === 'active').length;
        $('#stHabits').textContent = doneToday + '/' + act.length;
        $('#stStreak').textContent = Math.max(0, ...act.map(h => h.streak));

        const hb = $('#ovHabits'); hb.textContent = '';
        if (!act.length) hb.appendChild(el('div', 'sp-empty-inline', 'Add habits in the Tracker tab.'));
        act.forEach(h => {
            const on = h.days.includes(S.today), b = el('button', 'sp-check' + (on ? ' is-on' : '')); b.type = 'button';
            b.append(el('span', 'sp-check-box', on ? '✓' : ''), el('span', 'sp-check-name', h.name), el('span', 'sp-check-streak', '🔥 ' + h.streak));
            b.addEventListener('click', () => toggleHabit(h, S.today)); hb.appendChild(b);
        });
        const gl = $('#ovGoals'); gl.textContent = '';
        const goals = S.goals.filter(g => g.status === 'active').slice(0, 4);
        if (!goals.length) gl.appendChild(el('div', 'sp-empty-inline', 'No active goals yet.'));
        goals.forEach(g => {
            const wrap = el('div', 'sp-mini-goal'), pct = goalProgress(g), bar = el('div', 'sp-bar'), fill = el('i');
            fill.style.width = pct + '%'; bar.appendChild(fill);
            const top = el('div', 'sp-mini-goal-top'); top.append(el('span', null, g.title), el('b', null, pct + '%'));
            wrap.append(top, bar); gl.appendChild(wrap);
        });
        const nl = $('#ovNotes'); nl.textContent = '';
        const notes = S.notes.slice(0, 4);
        if (!notes.length) nl.appendChild(el('div', 'sp-empty-inline', 'No notes yet.'));
        notes.forEach(n => {
            const b = el('button', 'sp-mini-note'); b.type = 'button';
            b.append(el('span', null, (n.pinned ? '📌 ' : '') + noteTitle(n)), el('small', null, ago(n.updated)));
            b.addEventListener('click', () => { show('notes'); openNote(n); }); nl.appendChild(b);
        });
    }

    /* ---------- backup ---------- */
    $('#exportBtn').addEventListener('click', e => { e.preventDefault(); window.location.href = API + '/export'; });
    $('#importFile').addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        const mode = $('#importMode').value;
        if (mode === 'replace' && !confirm('This replaces ALL current notes, goals and habits. Continue?')) { e.target.value = ''; return; }
        try {
            const data = JSON.parse(await file.text());
            const r = await api('POST', '/import', { mode, data });
            toast('Imported ' + r.notes + ' notes, ' + r.goals + ' goals, ' + r.habits + ' habits'); await load();
        } catch (err) { if (err instanceof SyntaxError) toast('That file is not a valid backup.'); }
        e.target.value = '';
    });

    /* ---------- boot ---------- */
    function updateSub() {
        const view = (location.hash || '#overview').slice(1);
        if (TITLES[view]) $('#spSub').textContent = TITLES[view][1]();
    }
    function renderAll() {
        renderOverview(); renderTagFilter(); renderNoteList(); renderGoals(); renderTracker(); updateSub();
    }
    async function load() {
        const data = await api('GET', '/state?today=' + TODAY);
        S = data; sortNotes();
        if (currentNote) currentNote = S.notes.find(n => n.id === currentNote.id) || null;
        renderAll();
    }
    window.addEventListener('beforeunload', () => { if (saveTimer) flushSave(); });
    window.addEventListener('hashchange', () => show((location.hash || '#overview').slice(1)));
    load().then(() => show((location.hash || '#overview').slice(1)));
})();