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
        tasks: ['Tasks', () => S.tasks.filter(t => !t.done).length + ' open'],
        notes: ['Notes', () => S.notes.length + ' note' + (S.notes.length === 1 ? '' : 's')],
        journal: ['Journal', () => S.journal.length + ' entr' + (S.journal.length === 1 ? 'y' : 'ies')],
        goals: ['Goals', () => S.goals.filter(g => g.status === 'active').length + ' active'],
        tracker: ['Habit tracker', () => 'Small things, every day'],
        focus: ['Focus timer', () => 'Deep work, one session at a time'],
        apps: ['Applications', () => S.applications.length + ' tracked'],
        links: ['Links vault', () => S.links.length + ' saved'],
        backup: ['Backup', () => 'Export or restore your data']
    };
    async function leaveNotes() {
        await flushSave(); await dropIfEmpty(); closeEditor(); renderAll();
    }
    function show(view) {
        if (!TITLES[view]) view = 'overview';
        if (view !== 'notes' && currentNote) leaveNotes();
        if (view !== 'journal' && jrTimer) flushJournal();
        if (view === 'journal' && !jrLoaded) selectJournalDay(S.today);
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

    /* ---------- tasks ---------- */
    let taskFilter = 'open';
    const shortDate = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const dayDiff = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 864e5);
    function dueInfo(due) {
        if (!due) return null;
        const d = dayDiff(due, S.today);
        if (d < 0) return { label: 'Overdue · ' + shortDate(due), cls: 'is-bad' };
        if (d === 0) return { label: 'Today', cls: 'is-warn' };
        return { label: d === 1 ? 'Tomorrow' : shortDate(due), cls: '' };
    }
    function sortOpen(a, b) {
        const ad = a.due || '9999-99-99', bd = b.due || '9999-99-99';
        if (ad !== bd) return ad < bd ? -1 : 1;
        return (b.priority - a.priority) || (a.id - b.id);
    }
    async function toggleTask(t) {
        const prev = { done: t.done, completed: t.completed };
        t.done = !t.done; t.completed = t.done ? new Date().toISOString() : '';
        renderAll();
        try { Object.assign(t, await api('PUT', '/tasks/' + t.id, { done: t.done })); }
        catch (e) { Object.assign(t, prev); renderAll(); }
    }
    function taskChips(t) {
        const wrap = el('span', 'sp-task-chips');
        if (t.priority) wrap.appendChild(el('span', 'sp-chip pri-' + t.priority, ['', 'Low', 'Medium', 'High'][t.priority]));
        const due = !t.done && dueInfo(t.due);
        if (due) wrap.appendChild(el('span', 'sp-chip ' + due.cls, due.label));
        return wrap;
    }
    function taskRow(t) {
        const row = el('div', 'sp-task' + (t.done ? ' is-done' : ''));
        const chk = el('button', 'sp-task-check', t.done ? '✓' : ''); chk.type = 'button'; chk.setAttribute('aria-label', t.done ? 'Mark open' : 'Mark done');
        chk.addEventListener('click', () => toggleTask(t));
        const title = el('span', 'sp-task-title', t.title); title.title = 'Click to rename';
        title.addEventListener('click', async () => {
            const next = prompt('Rename task', t.title);
            if (next && next.trim() && next.trim() !== t.title) { Object.assign(t, await api('PUT', '/tasks/' + t.id, { title: next })); renderAll(); }
        });
        const del = el('button', 'sp-task-del', '×'); del.type = 'button'; del.setAttribute('aria-label', 'Delete task');
        del.addEventListener('click', async () => { await api('DELETE', '/tasks/' + t.id); S.tasks = S.tasks.filter(x => x.id !== t.id); renderAll(); });
        row.append(chk, title, taskChips(t), del);
        return row;
    }
    function renderTasks() {
        const list = $('#taskList'); list.textContent = '';
        const items = taskFilter === 'open' ? S.tasks.filter(t => !t.done).sort(sortOpen) : S.tasks.filter(t => t.done).sort((a, b) => (b.completed > a.completed ? 1 : -1));
        $('#taskClear').hidden = taskFilter !== 'done' || !items.length;
        if (!items.length) { list.appendChild(el('div', 'sp-empty-inline', taskFilter === 'open' ? 'Nothing to do — add a task above.' : 'No completed tasks yet.')); return; }
        items.forEach(t => list.appendChild(taskRow(t)));
    }
    $('#taskForm').addEventListener('submit', async e => {
        e.preventDefault();
        const title = $('#taskTitle').value.trim(); if (!title) return;
        S.tasks.push(await api('POST', '/tasks', { title, priority: +$('#taskPriority').value, due: $('#taskDue').value }));
        $('#taskTitle').value = ''; $('#taskDue').value = ''; renderAll();
    });
    $('#taskTabs').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        taskFilter = b.dataset.filter; $$('#taskTabs button').forEach(x => x.classList.toggle('is-active', x === b)); renderTasks();
    });
    $('#taskClear').addEventListener('click', async () => {
        const done = S.tasks.filter(t => t.done);
        if (!done.length || !confirm('Delete ' + done.length + ' completed task(s)?')) return;
        await Promise.all(done.map(t => api('DELETE', '/tasks/' + t.id)));
        S.tasks = S.tasks.filter(t => !t.done); renderAll();
    });

    /* ---------- journal ---------- */
    const MOODS = ['', '😞', '😕', '😐', '🙂', '😄'];
    let jrDay = TODAY, jrTimer = null, jrLoaded = null, jrMood = 0;
    let cal = { y: new Date().getFullYear(), m: new Date().getMonth() };
    const pad2 = n => String(n).padStart(2, '0');
    const niceDay = d => d === S.today ? 'Today' : d === addDays(S.today, -1) ? 'Yesterday' : new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const journalStreak = () => streaks(S.journal.map(e => e.day), S.today).streak;
    function setMoodUI() { $$('#jrMoods button').forEach(b => b.classList.toggle('is-on', +b.dataset.mood === jrMood)); }
    function renderJournal() {
        const entries = new Map(S.journal.map(e => [e.day, e]));
        $('#calTitle').textContent = new Date(cal.y, cal.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        const grid = $('#calGrid'); grid.textContent = '';
        const first = new Date(cal.y, cal.m, 1).getDay(), count = new Date(cal.y, cal.m + 1, 0).getDate();
        for (let i = 0; i < first; i++) grid.appendChild(el('i'));
        for (let d = 1; d <= count; d++) {
            const day = cal.y + '-' + pad2(cal.m + 1) + '-' + pad2(d), e = entries.get(day);
            const b = el('button', 'sp-cal-day' + (e ? ' has m' + (e.mood || 0) : '') + (day === S.today ? ' is-today' : '') + (day === jrDay ? ' is-sel' : ''), String(d));
            b.type = 'button'; if (day > S.today) b.disabled = true;
            b.addEventListener('click', () => selectJournalDay(day)); grid.appendChild(b);
        }
        const moods = S.journal.filter(e => e.mood && e.day >= addDays(S.today, -29)).map(e => e.mood);
        const avg = moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length) : 0;
        const st = $('#journalStats'); st.textContent = '';
        [[S.journal.length, 'entries'], [journalStreak(), 'day streak'], [avg ? MOODS[Math.round(avg)] + ' ' + avg.toFixed(1) : '–', '30-day mood']].forEach(([v, l]) => {
            const box = el('div'); box.append(el('b', null, String(v)), el('span', null, l)); st.appendChild(box);
        });
        const list = $('#jrList'); list.textContent = '';
        if (!S.journal.length) list.appendChild(el('div', 'sp-empty-inline', 'No entries yet — write about today.'));
        S.journal.slice(0, 8).forEach(e => {
            const b = el('button', 'sp-jr-item'); b.type = 'button';
            b.append(el('span', 'sp-jr-emoji', MOODS[e.mood] || '·'), el('span', 'sp-jr-day', niceDay(e.day)), el('span', 'sp-jr-prev', e.preview.replace(/\s+/g, ' ')));
            b.addEventListener('click', () => selectJournalDay(e.day)); list.appendChild(b);
        });
    }
    async function selectJournalDay(day) {
        await flushJournal();
        jrDay = day;
        const e = await api('GET', '/journal/' + day);
        jrLoaded = e; jrMood = e.mood || 0;
        $('#jrDate').textContent = niceDay(day); $('#jrBody').value = e.body || ''; $('#jrStatus').textContent = '';
        cal.y = +day.slice(0, 4); cal.m = +day.slice(5, 7) - 1;
        setMoodUI(); renderJournal();
    }
    async function saveJournal() {
        jrTimer = null;
        try {
            const r = await api('PUT', '/journal/' + jrDay, { mood: jrMood, body: $('#jrBody').value });
            S.journal = S.journal.filter(e => e.day !== jrDay);
            if (!r.deleted) S.journal.push({ day: r.day, mood: r.mood, preview: r.preview, chars: r.chars });
            S.journal.sort((a, b) => (a.day < b.day ? 1 : -1));
            $('#jrStatus').textContent = 'Saved ✓'; renderJournal(); renderOverview(); updateSub();
        } catch (e) { $('#jrStatus').textContent = 'Not saved'; }
    }
    function queueJournal() { $('#jrStatus').textContent = 'Typing…'; clearTimeout(jrTimer); jrTimer = setTimeout(saveJournal, 800); }
    async function flushJournal() { if (jrTimer) { clearTimeout(jrTimer); await saveJournal(); } }
    $('#jrBody').addEventListener('input', queueJournal);
    $('#jrMoods').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        jrMood = jrMood === +b.dataset.mood ? 0 : +b.dataset.mood; setMoodUI(); queueJournal();
    });
    $('#jrDelete').addEventListener('click', async () => {
        if (!confirm('Delete the entry for ' + niceDay(jrDay).toLowerCase() + '?')) return;
        clearTimeout(jrTimer); jrTimer = null;
        await api('DELETE', '/journal/' + jrDay); S.journal = S.journal.filter(e => e.day !== jrDay);
        $('#jrBody').value = ''; jrMood = 0; setMoodUI(); $('#jrStatus').textContent = ''; renderJournal(); renderOverview(); updateSub();
    });
    $('#calPrev').addEventListener('click', () => { cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } renderJournal(); });
    $('#calNext').addEventListener('click', () => { cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } renderJournal(); });

    /* ---------- focus timer ---------- */
    const FOCUS_KEY = 'spFocus', GOAL_KEY = 'spFocusGoal';
    let fMin = 25, fRun = null, fTick = null;
    const fmtClock = sec => pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60);
    const fmtMin = m => m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60 ? pad2(m % 60) + 'm' : '') : m + 'm';
    const focusGoal = () => Math.max(10, parseInt(localStorage.getItem(GOAL_KEY) || '120', 10) || 120);
    const focusSum = n => { let t = 0; for (let i = 0; i < n; i++) t += (S.focus_days || {})[addDays(S.today, -i)] || 0; return t; };
    function beep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [660, 880, 1100].forEach((f, i) => {
                const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.18;
                o.frequency.value = f; g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
                o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.17);
            });
        } catch (e) { }
    }
    function drawClock() {
        const total = (fRun ? fRun.minutes : fMin) * 60;
        const left = fRun ? Math.max(0, Math.ceil((fRun.endAt - Date.now()) / 1000)) : total;
        $('#clockTime').textContent = fmtClock(left);
        $('#clock').style.setProperty('--p', fRun ? (1 - left / total) * 100 : 0);
        $('#clockState').textContent = fRun ? 'Focusing…' : 'Ready';
        document.title = fRun ? '⏱ ' + fmtClock(left) + ' · Personal Space' : 'Personal Space';
        if (fRun && left === 0) finishFocus();
    }
    function setFocusButtons() {
        $('#focusStart').textContent = fRun ? 'Stop' : 'Start';
        $$('#presets button, #focusCustom').forEach(x => (x.disabled = !!fRun));
    }
    function startFocus() {
        fRun = { endAt: Date.now() + fMin * 60000, minutes: fMin, label: $('#focusLabel').value.trim() };
        try { localStorage.setItem(FOCUS_KEY, JSON.stringify(fRun)); } catch (e) { }
        clearInterval(fTick); fTick = setInterval(drawClock, 250); setFocusButtons(); drawClock();
    }
    function stopFocus() {
        clearInterval(fTick); fTick = null; fRun = null;
        try { localStorage.removeItem(FOCUS_KEY); } catch (e) { }
        setFocusButtons(); drawClock();
    }
    async function finishFocus() {
        const run = fRun; if (!run) return;
        stopFocus(); beep(); toast('Focus session complete — nice work!');
        try { await api('POST', '/focus', { minutes: run.minutes, label: run.label, day: TODAY }); await load(); } catch (e) { }
    }
    function renderFocus() {
        const today = (S.focus_days || {})[S.today] || 0, goal = focusGoal();
        $('#fsToday').textContent = fmtMin(today); $('#fsWeek').textContent = fmtMin(focusSum(7)); $('#fsAvg').textContent = fmtMin(Math.round(focusSum(14) / 14));
        $('#focusGoal').value = goal; $('#focusGoalBar').style.width = Math.min(100, today / goal * 100) + '%';
        const chart = $('#focusChart'); chart.textContent = '';
        const vals = Array.from({ length: 14 }, (_, i) => { const d = addDays(S.today, i - 13); return [d, (S.focus_days || {})[d] || 0]; });
        const max = Math.max(goal, ...vals.map(v => v[1]), 1);
        vals.forEach(([d, m]) => {
            const col = el('div', 'sp-bar-col' + (d === S.today ? ' is-today' : '')), bar = el('i');
            bar.style.height = Math.max(m ? 6 : 2, m / max * 100) + '%'; col.title = d + ': ' + m + ' min';
            col.append(bar, el('span', null, new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'narrow' }))); chart.appendChild(col);
        });
        const list = $('#focusRecent'); list.textContent = '';
        if (!S.focus_recent.length) list.appendChild(el('div', 'sp-empty-inline', 'No sessions yet — start your first one.'));
        S.focus_recent.forEach(f => {
            const row = el('div', 'sp-session');
            row.append(el('span', 'sp-session-label', f.label || 'Focus session'), el('span', 'sp-chip', f.minutes + ' min'), el('span', 'sp-muted-sm', niceDay(f.day)));
            const del = el('button', 'sp-task-del', '×'); del.type = 'button'; del.setAttribute('aria-label', 'Delete session');
            del.addEventListener('click', async () => { await api('DELETE', '/focus/' + f.id); await load(); });
            row.appendChild(del); list.appendChild(row);
        });
    }
    $('#presets').addEventListener('click', e => {
        const b = e.target.closest('button[data-min]'); if (!b || fRun) return;
        fMin = +b.dataset.min; $('#focusCustom').value = '';
        $$('#presets button').forEach(x => x.classList.toggle('is-active', x === b)); drawClock();
    });
    $('#focusCustom').addEventListener('input', e => {
        const v = parseInt(e.target.value, 10);
        if (v >= 1 && v <= 180 && !fRun) { fMin = v; $$('#presets button').forEach(x => x.classList.remove('is-active')); drawClock(); }
    });
    $('#focusStart').addEventListener('click', () => (fRun ? stopFocus() : startFocus()));
    $('#focusReset').addEventListener('click', stopFocus);
    $('#focusGoal').addEventListener('change', e => { try { localStorage.setItem(GOAL_KEY, String(Math.max(10, +e.target.value || 120))); } catch (x) { } renderFocus(); renderOverview(); });
    $('#focusManual').addEventListener('submit', async e => {
        e.preventDefault();
        const m = parseInt($('#focusManualMin').value, 10); if (!m) return;
        await api('POST', '/focus', { minutes: m, label: $('#focusLabel').value.trim(), day: S.today });
        $('#focusManualMin').value = ''; toast('Logged ' + m + ' minutes'); await load();
    });

    /* ---------- applications ---------- */
    const COLS = [['wishlist', 'Wishlist'], ['applied', 'Applied'], ['interview', 'Interview'], ['offer', 'Offer'], ['rejected', 'Rejected']];
    let editingApp = null;
    function followInfo(a) {
        if (!a.follow_up || !['applied', 'interview'].includes(a.status)) return null;
        const d = dayDiff(a.follow_up, S.today);
        return d < 0 ? { label: 'Follow-up overdue', cls: 'is-bad' } : d === 0 ? { label: 'Follow up today', cls: 'is-warn' } : { label: 'Follow up ' + shortDate(a.follow_up), cls: '' };
    }
    function appCard(a) {
        const card = el('div', 'sp-app-card st-' + a.status);
        card.appendChild(el('div', 'sp-app-company', a.company));
        if (a.role) card.appendChild(el('div', 'sp-app-role', a.role));
        const chips = el('div', 'sp-task-chips');
        if (a.applied_on) chips.appendChild(el('span', 'sp-chip', 'Applied ' + shortDate(a.applied_on)));
        const f = followInfo(a); if (f) chips.appendChild(el('span', 'sp-chip ' + f.cls, f.label));
        if (chips.children.length) card.appendChild(chips);
        if (a.notes) card.appendChild(el('div', 'sp-app-notes', a.notes));
        if (/^https?:\/\//i.test(a.link)) { const l = el('a', 'sp-card-link', 'Open posting ↗'); l.href = a.link; l.target = '_blank'; l.rel = 'noopener noreferrer'; card.appendChild(l); }
        const tools = el('div', 'sp-app-tools'), sel = el('select', 'sp-input sp-app-select'); sel.setAttribute('aria-label', 'Change status');
        COLS.forEach(([v, label]) => { const o = el('option', null, label); o.value = v; if (v === a.status) o.selected = true; sel.appendChild(o); });
        sel.addEventListener('change', async () => {
            const patch = { status: sel.value }; if (sel.value === 'applied' && !a.applied_on) patch.applied_on = S.today;
            Object.assign(a, await api('PUT', '/applications/' + a.id, patch)); renderAll();
        });
        const edit = el('button', 'sp-link-btn', 'Edit'); edit.type = 'button'; edit.addEventListener('click', () => openAppForm(a));
        const del = el('button', 'sp-link-btn is-danger', 'Delete'); del.type = 'button';
        del.addEventListener('click', async () => { if (!confirm('Delete ' + a.company + '?')) return; await api('DELETE', '/applications/' + a.id); S.applications = S.applications.filter(x => x.id !== a.id); renderAll(); });
        tools.append(sel, edit, del); card.appendChild(tools);
        return card;
    }
    function renderApps() {
        const apps = S.applications, st = $('#appStats'); st.textContent = '';
        const count = k => apps.filter(a => a.status === k).length;
        [['TOTAL', apps.length], ['ACTIVE', count('wishlist') + count('applied') + count('interview')], ['INTERVIEWS', count('interview')], ['OFFERS', count('offer')]].forEach(([l, v]) => {
            const t = el('div', 'sp-stat'); t.append(el('span', 'sp-stat-label', l), el('b', null, String(v))); st.appendChild(t);
        });
        const due = apps.filter(a => { const f = followInfo(a); return f && f.cls; }).length;
        $('#appHint').textContent = due ? '⏰ ' + due + ' follow-up' + (due === 1 ? '' : 's') + ' need attention' : '';
        const board = $('#appBoard'); board.textContent = '';
        if (!apps.length) { board.appendChild(el('div', 'sp-empty-inline', 'Track every internship or job you apply to — add your first one.')); return; }
        COLS.forEach(([k, label]) => {
            const col = el('div', 'sp-col'), items = apps.filter(a => a.status === k);
            const head = el('div', 'sp-col-head'); head.append(el('span', null, label), el('b', null, String(items.length))); col.appendChild(head);
            items.forEach(a => col.appendChild(appCard(a)));
            if (!items.length) col.appendChild(el('div', 'sp-col-empty', 'Empty'));
            board.appendChild(col);
        });
    }
    function openAppForm(a) {
        editingApp = a || null;
        $('#appFormTitle').textContent = a ? 'Edit application' : 'New application';
        $('#appCompany').value = a ? a.company : ''; $('#appRole').value = a ? a.role : ''; $('#appStatus').value = a ? a.status : 'applied';
        $('#appApplied').value = a ? a.applied_on : S.today; $('#appFollow').value = a ? a.follow_up : '';
        $('#appLink').value = a ? a.link : ''; $('#appNotes').value = a ? a.notes : '';
        $('#appForm').hidden = false; $('#appCompany').focus(); $('#appForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    $('#appNew').addEventListener('click', () => openAppForm(null));
    $('#appCancel').addEventListener('click', () => { $('#appForm').hidden = true; });
    $('#appForm').addEventListener('submit', async e => {
        e.preventDefault();
        const payload = {
            company: $('#appCompany').value, role: $('#appRole').value, status: $('#appStatus').value, applied_on: $('#appApplied').value,
            follow_up: $('#appFollow').value, link: $('#appLink').value, notes: $('#appNotes').value
        };
        if (editingApp) await api('PUT', '/applications/' + editingApp.id, payload); else await api('POST', '/applications', payload);
        $('#appForm').hidden = true; await load();
    });

    /* ---------- links vault ---------- */
    const domainOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
    function renderLinks() {
        const sel = $('#linkTagFilter'), keep = sel.value;
        const tags = Array.from(new Set(S.links.map(l => l.tag).filter(Boolean))).sort();
        sel.textContent = ''; sel.appendChild(Object.assign(el('option', null, 'All tags'), { value: '' }));
        tags.forEach(t => sel.appendChild(Object.assign(el('option', null, '#' + t), { value: t }))); sel.value = tags.includes(keep) ? keep : '';
        const q = $('#linkSearch').value.trim().toLowerCase(), tag = sel.value;
        const items = S.links.filter(l => (!tag || l.tag === tag) && (!q || (l.title + ' ' + l.url + ' ' + l.tag).toLowerCase().includes(q)));
        const grid = $('#linkGrid'); grid.textContent = '';
        if (!items.length) { grid.appendChild(el('div', 'sp-empty-inline', S.links.length ? 'No links match.' : 'Save articles, tools and references you want to keep.')); return; }
        items.forEach(l => {
            const card = el('div', 'sp-link-card'), dom = domainOf(l.url);
            const top = el('div', 'sp-link-top'); top.append(el('span', 'sp-link-badge', (dom[0] || '?').toUpperCase()));
            const info = el('div', 'sp-link-info'); info.append(el('div', 'sp-link-title', l.title || dom), el('div', 'sp-link-domain', dom)); top.appendChild(info); card.appendChild(top);
            if (l.tag) card.appendChild(el('span', 'sp-chip', '#' + l.tag));
            const tools = el('div', 'sp-habit-tools');
            if (/^https?:\/\//i.test(l.url)) { const open = el('a', 'sp-link-btn', 'Open ↗'); open.href = l.url; open.target = '_blank'; open.rel = 'noopener noreferrer'; tools.appendChild(open); }
            const edit = el('button', 'sp-link-btn', 'Edit'); edit.type = 'button';
            edit.addEventListener('click', async () => {
                const title = prompt('Title', l.title); if (title === null) return;
                const tg = prompt('Tag', l.tag); if (tg === null) return;
                Object.assign(l, await api('PUT', '/links/' + l.id, { title, tag: tg })); renderAll();
            });
            const del = el('button', 'sp-link-btn is-danger', 'Delete'); del.type = 'button';
            del.addEventListener('click', async () => { if (!confirm('Delete this link?')) return; await api('DELETE', '/links/' + l.id); S.links = S.links.filter(x => x.id !== l.id); renderAll(); });
            tools.append(edit, del); card.appendChild(tools); grid.appendChild(card);
        });
    }
    $('#linkForm').addEventListener('submit', async e => {
        e.preventDefault();
        let url = $('#linkUrl').value.trim(); if (url && !/^[a-z]+:/i.test(url)) url = 'https://' + url;
        S.links.unshift(await api('POST', '/links', { url, title: $('#linkTitle').value, tag: $('#linkTag').value }));
        ['#linkUrl', '#linkTitle', '#linkTag'].forEach(s => ($(s).value = '')); renderAll();
    });
    $('#linkSearch').addEventListener('input', renderLinks);
    $('#linkTagFilter').addEventListener('change', renderLinks);

    /* ---------- global search (Ctrl/Cmd + K) ---------- */
    let sTimer = null, sItems = [], sIdx = 0, sSeq = 0;
    const TYPE_VIEW = { note: 'notes', task: 'tasks', goal: 'goals', journal: 'journal', application: 'apps', link: 'links' };
    function openSearch() { $('#spSearch').hidden = false; $('#spSearchInput').value = ''; sItems = []; renderSearch(); $('#spSearchInput').focus(); }
    function closeSearch() { $('#spSearch').hidden = true; }
    function renderSearch() {
        const box = $('#spSearchResults'); box.textContent = '';
        const q = $('#spSearchInput').value.trim();
        if (!sItems.length) { box.appendChild(el('div', 'sp-empty-inline', q.length < 2 ? 'Type at least 2 letters…' : 'No results.')); return; }
        sItems.forEach((r, i) => {
            const b = el('button', 'sp-result' + (i === sIdx ? ' is-active' : '')); b.type = 'button';
            b.append(el('span', 'sp-result-type', r.type), el('span', 'sp-result-title', r.title), el('span', 'sp-result-snip', (r.snippet || '').replace(/\s+/g, ' ')));
            b.addEventListener('mousedown', e => { e.preventDefault(); pickResult(r); }); box.appendChild(b);
        });
    }
    async function pickResult(r) {
        closeSearch(); show(TYPE_VIEW[r.type]);
        if (r.type === 'note') { const n = S.notes.find(x => x.id === r.id); if (n) openNote(n); }
        else if (r.type === 'journal') selectJournalDay(r.id);
        else if (r.type === 'goal') { const g = S.goals.find(x => x.id === r.id); if (g && g.status !== goalFilter) { goalFilter = g.status; $$('#goalTabs button').forEach(x => x.classList.toggle('is-active', x.dataset.filter === goalFilter)); renderGoals(); } }
    }
    $('#spSearchBtn').addEventListener('click', openSearch);
    $('#spSearch').addEventListener('mousedown', e => { if (e.target.id === 'spSearch') closeSearch(); });
    $('#spSearchInput').addEventListener('input', () => {
        clearTimeout(sTimer);
        const q = $('#spSearchInput').value.trim();
        if (q.length < 2) { sItems = []; renderSearch(); return; }
        sTimer = setTimeout(async () => {
            const seq = ++sSeq;
            try { const r = await api('GET', '/search?q=' + encodeURIComponent(q)); if (seq === sSeq) { sItems = r.results; sIdx = 0; renderSearch(); } } catch (e) { }
        }, 180);
    });
    $('#spSearchInput').addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' && sItems.length) { e.preventDefault(); sIdx = (sIdx + 1) % sItems.length; renderSearch(); }
        else if (e.key === 'ArrowUp' && sItems.length) { e.preventDefault(); sIdx = (sIdx - 1 + sItems.length) % sItems.length; renderSearch(); }
        else if (e.key === 'Enter' && sItems[sIdx]) { e.preventDefault(); pickResult(sItems[sIdx]); }
    });
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#spSearch').hidden ? openSearch() : closeSearch(); }
        else if (e.key === 'Escape' && !$('#spSearch').hidden) closeSearch();
    });

    /* ---------- overview ---------- */
    function metric(label, valueText, pct) {
        const row = el('div', 'sp-metric'), top = el('div', 'sp-metric-top'), bar = el('div', 'sp-bar'), fill = el('i');
        fill.style.width = Math.max(0, Math.min(100, pct)) + '%'; bar.appendChild(fill);
        top.append(el('span', null, label), el('b', null, valueText)); row.append(top, bar); return row;
    }
    function renderOverview() {
        const act = activeHabits(), doneToday = act.filter(h => h.days.includes(S.today)).length;
        const openTasks = S.tasks.filter(t => !t.done).sort(sortOpen);
        const focusToday = (S.focus_days || {})[S.today] || 0;
        $('#stTasks').textContent = openTasks.length;
        $('#stHabits').textContent = doneToday + '/' + act.length;
        $('#stFocus').textContent = fmtMin(focusToday);
        $('#stJournal').textContent = journalStreak();

        const hb = $('#ovHabits'); hb.textContent = '';
        if (!act.length) hb.appendChild(el('div', 'sp-empty-inline', 'Add habits in the Habits tab.'));
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
        const tl = $('#ovTasks'); tl.textContent = '';
        if (!openTasks.length) tl.appendChild(el('div', 'sp-empty-inline', 'All clear — nothing open.'));
        openTasks.slice(0, 5).forEach(t => {
            const row = el('div', 'sp-task'); const chk = el('button', 'sp-task-check'); chk.type = 'button'; chk.setAttribute('aria-label', 'Mark done');
            chk.addEventListener('click', () => toggleTask(t)); row.append(chk, el('span', 'sp-task-title', t.title), taskChips(t)); tl.appendChild(row);
        });
        const wk = $('#ovWeek'); wk.textContent = '';
        const from = addDays(S.today, -6);
        const habitPct = act.length ? act.reduce((n, h) => n + h.days.filter(d => d >= from).length, 0) / (act.length * 7) * 100 : 0;
        const doneWeek = S.tasks.filter(t => t.done && t.completed && t.completed.slice(0, 10) >= from).length;
        const jDays = S.journal.filter(e => e.day >= from).length, fw = focusSum(7);
        wk.append(metric('Focus time', fmtMin(fw), fw / (focusGoal() * 7) * 100), metric('Tasks completed', String(doneWeek), doneWeek * 10),
            metric('Habit consistency', Math.round(habitPct) + '%', habitPct), metric('Journal days', jDays + '/7', jDays / 7 * 100));
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
            toast('Imported ' + Object.entries(r).filter(([k]) => k !== 'ok').map(([k, v]) => v + ' ' + k).join(', ')); await load();
        } catch (err) { if (err instanceof SyntaxError) toast('That file is not a valid backup.'); }
        e.target.value = '';
    });

    /* ---------- boot ---------- */
    function updateSub() {
        const view = (location.hash || '#overview').slice(1);
        if (TITLES[view]) $('#spSub').textContent = TITLES[view][1]();
    }
    function renderAll() {
        renderOverview(); renderTagFilter(); renderNoteList(); renderGoals(); renderTracker();
        renderTasks(); renderJournal(); renderFocus(); renderApps(); renderLinks(); updateSub();
    }
    async function load() {
        const data = await api('GET', '/state?today=' + TODAY);
        S = data; sortNotes();
        if (currentNote) currentNote = S.notes.find(n => n.id === currentNote.id) || null;
        renderAll();
    }
    function restoreFocus() {
        try {
            const saved = JSON.parse(localStorage.getItem(FOCUS_KEY) || 'null');
            if (!saved || !saved.endAt) return;
            if (saved.endAt > Date.now() || Date.now() - saved.endAt < 6 * 3600e3) {
                fRun = saved; fMin = saved.minutes; $('#focusLabel').value = saved.label || '';
                $$('#presets button').forEach(x => x.classList.toggle('is-active', +x.dataset.min === fMin));
                fTick = setInterval(drawClock, 250); setFocusButtons(); drawClock();
            } else localStorage.removeItem(FOCUS_KEY);
        } catch (e) { }
    }
    window.addEventListener('beforeunload', () => { if (saveTimer) flushSave(); if (jrTimer) flushJournal(); });
    window.addEventListener('hashchange', () => show((location.hash || '#overview').slice(1)));
    load().then(() => { restoreFocus(); show((location.hash || '#overview').slice(1)); });
})();