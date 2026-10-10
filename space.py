"""
Personal Space - a private, password-protected dashboard (notes, goals, habit tracker).

Registered as a Flask blueprint under /space.
 * Completely OFF (404) unless SPACE_PASSWORD or SPACE_PASSWORD_HASH is set in .env
 * Data lives in data/space.db (already covered by .gitignore -> data/*.db)
 * Never linked from the public site, never indexed, never read by the AI agent.
"""
import os
import json
import time
import hmac
import secrets
import sqlite3
from datetime import date, datetime, timedelta
from contextlib import contextmanager
from functools import wraps

from flask import (Blueprint, Response, abort, current_app, jsonify, redirect,
                   request, session, url_for)
from werkzeug.security import check_password_hash

space_bp = Blueprint('space', __name__, url_prefix='/space')

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'space.db')
SESSION_HOURS = 12
MAX_FAILS, FAIL_WINDOW = 8, 600          # 8 wrong passwords per 10 minutes (global - this is a one-person space)
LIMITS = {'notes': 2000, 'goals': 200, 'habits': 50}
_fails = []


# ------------------------------------------------------------------ setup ---
def init_app(app):
    """Call once from app.py: configures sessions, creates the DB, registers the blueprint."""
    if not app.secret_key:
        key = os.environ.get('SECRET_KEY')
        if not key:
            key = secrets.token_hex(32)
            print('[space] SECRET_KEY missing in .env - using a temporary key (you will be logged out on every restart).')
        app.secret_key = key
    app.config.setdefault('SESSION_COOKIE_HTTPONLY', True)
    app.config.setdefault('SESSION_COOKIE_SAMESITE', 'Lax')
    if os.environ.get('SPACE_SECURE_COOKIE') == '1':      # set this on HTTPS hosting (Render etc.)
        app.config['SESSION_COOKIE_SECURE'] = True
    init_db()
    app.register_blueprint(space_bp)


@contextmanager
def _db():
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with _db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
            tag TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
            target_date TEXT NOT NULL DEFAULT '', milestones TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'active', created TEXT NOT NULL, updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS checkins (
            habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE, day TEXT NOT NULL,
            PRIMARY KEY (habit_id, day));
        """)


# ------------------------------------------------------------------- auth ---
def _enabled():
    return bool(os.environ.get('SPACE_PASSWORD_HASH') or os.environ.get('SPACE_PASSWORD'))


def _password_ok(pw):
    pw_hash = os.environ.get('SPACE_PASSWORD_HASH')
    if pw_hash:
        try:
            return check_password_hash(pw_hash, pw)
        except Exception:
            return False
    plain = os.environ.get('SPACE_PASSWORD', '')
    return bool(plain) and hmac.compare_digest(pw.encode(), plain.encode())


def _authed():
    t = session.get('space_at')
    return bool(t) and (time.time() - t) < SESSION_HOURS * 3600


def _csrf():
    if 'csrf' not in session:
        session['csrf'] = secrets.token_urlsafe(24)
    return session['csrf']


def _csrf_ok(supplied):
    return bool(supplied) and hmac.compare_digest(str(supplied), session.get('csrf', ''))


def _locked():
    now = time.time()
    _fails[:] = [t for t in _fails if now - t < FAIL_WINDOW]
    return len(_fails) >= MAX_FAILS


def _page(fn):
    """HTML pages: 404 when disabled, redirect to login when logged out."""
    @wraps(fn)
    def wrapper(*a, **k):
        if not _enabled():
            abort(404)
        if not _authed():
            return redirect(url_for('space.login'))
        return fn(*a, **k)
    return wrapper


def _api(fn):
    """JSON API: needs login, and a CSRF header on every write."""
    @wraps(fn)
    def wrapper(*a, **k):
        if not _enabled():
            abort(404)
        if not _authed():
            return jsonify({'error': 'Please log in again.'}), 401
        if request.method != 'GET' and not _csrf_ok(request.headers.get('X-CSRF-Token')):
            return jsonify({'error': 'Security token expired - refresh the page.'}), 403
        try:
            return fn(*a, **k)
        except ValueError as e:
            return jsonify({'error': str(e)}), 400
    return wrapper


@space_bp.after_request
def _private_headers(resp):
    resp.headers['Cache-Control'] = 'no-store'
    resp.headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive'
    resp.headers['Referrer-Policy'] = 'no-referrer'
    resp.headers['X-Frame-Options'] = 'DENY'
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    return resp


def _render(name, **ctx):
    # rendered straight from the Jinja env so the site-wide context processor
    # (GitHub XP sync) does not run for private pages
    html = current_app.jinja_env.get_template(name).render(**ctx)
    return Response(html, mimetype='text/html')


# ----------------------------------------------------------------- pages ----
@space_bp.route('/login', methods=['GET', 'POST'])
def login():
    if not _enabled():
        abort(404)
    if request.method == 'POST':
        if not _csrf_ok(request.form.get('csrf')):
            return _render('space/login.html', csrf=_csrf(), error='Session expired - please try again.'), 400
        if _locked():
            return _render('space/login.html', csrf=_csrf(), error='Too many attempts. Try again in a few minutes.'), 429
        if _password_ok(request.form.get('password', '')):
            session.clear()
            session['space_at'] = time.time()
            _csrf()
            return redirect(url_for('space.dashboard'))
        _fails.append(time.time())
        time.sleep(0.5)                                   # slows down guessing
        return _render('space/login.html', csrf=_csrf(), error='Wrong password.'), 401
    return _render('space/login.html', csrf=_csrf(), error='')


@space_bp.post('/logout')
def logout():
    if _csrf_ok(request.form.get('csrf')):
        session.clear()
    return redirect(url_for('space.login'))


@space_bp.route('/')
@_page
def dashboard():
    return _render('space/dashboard.html', csrf=_csrf())


# ------------------------------------------------------------- validation ---
def _s(value, maxlen, field, required=False):
    v = value if isinstance(value, str) else ('' if value is None else str(value))
    v = v.strip()
    if required and not v:
        raise ValueError(f'{field} is required.')
    if len(v) > maxlen:
        raise ValueError(f'{field} is too long (max {maxlen}).')
    return v


def _day(value, field='date', allow_empty=False):
    if allow_empty and not value:
        return ''
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError:
        raise ValueError(f'{field} must look like YYYY-MM-DD.')


def _iso(value):
    try:
        return datetime.fromisoformat(str(value)).isoformat(timespec='seconds')
    except ValueError:
        return _now()


def _now():
    return datetime.now().isoformat(timespec='seconds')


def _clean_note(d, partial=False):
    out = {}
    if not partial or 'title' in d: out['title'] = _s(d.get('title'), 120, 'Title')
    if not partial or 'body' in d: out['body'] = _s(d.get('body'), 20000, 'Note')
    if not partial or 'tag' in d: out['tag'] = _s(d.get('tag'), 30, 'Tag').lstrip('#')
    if not partial or 'pinned' in d: out['pinned'] = 1 if d.get('pinned') else 0
    return out


def _clean_milestones(items):
    if not isinstance(items, list) or len(items) > 30:
        raise ValueError('A goal can have up to 30 milestones.')
    out = []
    for m in items:
        if not isinstance(m, dict):
            raise ValueError('Invalid milestone.')
        text = _s(m.get('text'), 120, 'Milestone', required=True)
        out.append({'text': text, 'done': bool(m.get('done'))})
    return out


def _clean_goal(d, partial=False):
    out = {}
    if not partial or 'title' in d: out['title'] = _s(d.get('title'), 120, 'Title', required=True)
    if not partial or 'description' in d: out['description'] = _s(d.get('description'), 1000, 'Description')
    if not partial or 'target_date' in d: out['target_date'] = _day(d.get('target_date'), 'Target date', allow_empty=True)
    if not partial or 'milestones' in d: out['milestones'] = json.dumps(_clean_milestones(d.get('milestones', [])))
    if not partial or 'status' in d:
        status = d.get('status', 'active')
        if status not in ('active', 'done'):
            raise ValueError('Invalid status.')
        out['status'] = status
    return out


def _body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValueError('Invalid request.')
    return data


def _count(c, table):
    return c.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]


# ---------------------------------------------------------------- serialise -
def _note_row(r):
    return {'id': r['id'], 'title': r['title'], 'body': r['body'], 'tag': r['tag'],
            'pinned': bool(r['pinned']), 'created': r['created'], 'updated': r['updated']}


def _goal_row(r):
    return {'id': r['id'], 'title': r['title'], 'description': r['description'], 'target_date': r['target_date'],
            'milestones': json.loads(r['milestones'] or '[]'), 'status': r['status'],
            'created': r['created'], 'updated': r['updated']}


def _streaks(days, today):
    d = today if today.isoformat() in days else today - timedelta(days=1)
    current = 0
    while d.isoformat() in days:
        current += 1
        d -= timedelta(days=1)
    best = run = 0
    prev = None
    for s in sorted(days):
        cur = date.fromisoformat(s)
        run = run + 1 if prev and (cur - prev).days == 1 else 1
        best = max(best, run)
        prev = cur
    return current, best


def _habit_rows(c, today):
    habits = []
    for h in c.execute('SELECT * FROM habits ORDER BY archived, id').fetchall():
        days = {r['day'] for r in c.execute('SELECT day FROM checkins WHERE habit_id=?', (h['id'],))}
        streak, best = _streaks(days, today)
        recent = sorted(d for d in days if d >= (today - timedelta(days=400)).isoformat())
        habits.append({'id': h['id'], 'name': h['name'], 'archived': bool(h['archived']),
                       'streak': streak, 'best': best, 'total': len(days), 'days': recent})
    return habits


def _client_today():
    """The browser's local date (so late-night check-ins land on the right day)."""
    try:
        d = date.fromisoformat(request.args.get('today', ''))
        if abs((d - date.today()).days) <= 1:
            return d
    except ValueError:
        pass
    return date.today()


# -------------------------------------------------------------------- API ---
@space_bp.get('/api/state')
@_api
def state():
    today = _client_today()
    with _db() as c:
        notes = [_note_row(r) for r in c.execute('SELECT * FROM notes ORDER BY pinned DESC, updated DESC')]
        goals = [_goal_row(r) for r in c.execute("SELECT * FROM goals ORDER BY status = 'done', target_date = '', target_date, id")]
        habits = _habit_rows(c, today)
    return jsonify({'notes': notes, 'goals': goals, 'habits': habits, 'today': today.isoformat()})


# notes
@space_bp.post('/api/notes')
@_api
def note_create():
    data = _clean_note(_body())
    now = _now()
    with _db() as c:
        if _count(c, 'notes') >= LIMITS['notes']:
            raise ValueError('Note limit reached.')
        cur = c.execute('INSERT INTO notes (title, body, tag, pinned, created, updated) VALUES (?,?,?,?,?,?)',
                        (data['title'], data['body'], data['tag'], data['pinned'], now, now))
        row = c.execute('SELECT * FROM notes WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(_note_row(row)), 201


@space_bp.put('/api/notes/<int:nid>')
@_api
def note_update(nid):
    data = _clean_note(_body(), partial=True)
    if not data:
        raise ValueError('Nothing to update.')
    data['updated'] = _now()
    sets = ', '.join(f'{k}=?' for k in data)
    with _db() as c:
        if not c.execute('SELECT 1 FROM notes WHERE id=?', (nid,)).fetchone():
            return jsonify({'error': 'Note not found.'}), 404
        c.execute(f'UPDATE notes SET {sets} WHERE id=?', (*data.values(), nid))
        row = c.execute('SELECT * FROM notes WHERE id=?', (nid,)).fetchone()
    return jsonify(_note_row(row))


@space_bp.delete('/api/notes/<int:nid>')
@_api
def note_delete(nid):
    with _db() as c:
        c.execute('DELETE FROM notes WHERE id=?', (nid,))
    return jsonify({'ok': True})


# goals
@space_bp.post('/api/goals')
@_api
def goal_create():
    data = _clean_goal(_body())
    now = _now()
    with _db() as c:
        if _count(c, 'goals') >= LIMITS['goals']:
            raise ValueError('Goal limit reached.')
        cur = c.execute('INSERT INTO goals (title, description, target_date, milestones, status, created, updated) VALUES (?,?,?,?,?,?,?)',
                        (data['title'], data['description'], data['target_date'], data['milestones'], data['status'], now, now))
        row = c.execute('SELECT * FROM goals WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(_goal_row(row)), 201


@space_bp.put('/api/goals/<int:gid>')
@_api
def goal_update(gid):
    data = _clean_goal(_body(), partial=True)
    if not data:
        raise ValueError('Nothing to update.')
    data['updated'] = _now()
    sets = ', '.join(f'{k}=?' for k in data)
    with _db() as c:
        if not c.execute('SELECT 1 FROM goals WHERE id=?', (gid,)).fetchone():
            return jsonify({'error': 'Goal not found.'}), 404
        c.execute(f'UPDATE goals SET {sets} WHERE id=?', (*data.values(), gid))
        row = c.execute('SELECT * FROM goals WHERE id=?', (gid,)).fetchone()
    return jsonify(_goal_row(row))


@space_bp.delete('/api/goals/<int:gid>')
@_api
def goal_delete(gid):
    with _db() as c:
        c.execute('DELETE FROM goals WHERE id=?', (gid,))
    return jsonify({'ok': True})


# habits
@space_bp.post('/api/habits')
@_api
def habit_create():
    name = _s(_body().get('name'), 60, 'Habit name', required=True)
    with _db() as c:
        if _count(c, 'habits') >= LIMITS['habits']:
            raise ValueError('Habit limit reached.')
        c.execute('INSERT INTO habits (name, created) VALUES (?,?)', (name, _now()))
    return jsonify({'ok': True}), 201


@space_bp.put('/api/habits/<int:hid>')
@_api
def habit_update(hid):
    d = _body()
    with _db() as c:
        if not c.execute('SELECT 1 FROM habits WHERE id=?', (hid,)).fetchone():
            return jsonify({'error': 'Habit not found.'}), 404
        if 'name' in d:
            c.execute('UPDATE habits SET name=? WHERE id=?', (_s(d['name'], 60, 'Habit name', required=True), hid))
        if 'archived' in d:
            c.execute('UPDATE habits SET archived=? WHERE id=?', (1 if d['archived'] else 0, hid))
    return jsonify({'ok': True})


@space_bp.delete('/api/habits/<int:hid>')
@_api
def habit_delete(hid):
    with _db() as c:
        c.execute('DELETE FROM habits WHERE id=?', (hid,))
    return jsonify({'ok': True})


@space_bp.post('/api/habits/<int:hid>/toggle')
@_api
def habit_toggle(hid):
    day = _day(_body().get('day'), 'Day')
    d = date.fromisoformat(day)
    if d > date.today() + timedelta(days=1) or d < date.today() - timedelta(days=60):
        raise ValueError('You can only edit the last 60 days.')
    with _db() as c:
        if not c.execute('SELECT 1 FROM habits WHERE id=?', (hid,)).fetchone():
            return jsonify({'error': 'Habit not found.'}), 404
        if c.execute('SELECT 1 FROM checkins WHERE habit_id=? AND day=?', (hid, day)).fetchone():
            c.execute('DELETE FROM checkins WHERE habit_id=? AND day=?', (hid, day))
            checked = False
        else:
            c.execute('INSERT INTO checkins (habit_id, day) VALUES (?,?)', (hid, day))
            checked = True
    return jsonify({'checked': checked})


# backup
@space_bp.get('/api/export')
@_api
def export_all():
    with _db() as c:
        notes = [{k: r[k] for k in ('title', 'body', 'tag', 'pinned', 'created', 'updated')} for r in c.execute('SELECT * FROM notes ORDER BY id')]
        goals = [{**{k: r[k] for k in ('title', 'description', 'target_date', 'status', 'created', 'updated')},
                  'milestones': json.loads(r['milestones'] or '[]')} for r in c.execute('SELECT * FROM goals ORDER BY id')]
        habits = [{'name': h['name'], 'archived': bool(h['archived']),
                   'days': [r['day'] for r in c.execute('SELECT day FROM checkins WHERE habit_id=? ORDER BY day', (h['id'],))]}
                  for h in c.execute('SELECT * FROM habits ORDER BY id')]
    payload = json.dumps({'version': 1, 'exported': _now(), 'notes': notes, 'goals': goals, 'habits': habits}, indent=2)
    return Response(payload, mimetype='application/json',
                    headers={'Content-Disposition': f'attachment; filename=personal-space-{date.today().isoformat()}.json'})


@space_bp.post('/api/import')
@_api
def import_all():
    if (request.content_length or 0) > 2_000_000:
        raise ValueError('Backup file is too large (max 2 MB).')
    body = _body()
    mode = body.get('mode')
    data = body.get('data')
    if mode not in ('merge', 'replace') or not isinstance(data, dict):
        raise ValueError('Invalid backup file.')
    notes, goals, habits = data.get('notes', []), data.get('goals', []), data.get('habits', [])
    if not all(isinstance(x, list) for x in (notes, goals, habits)):
        raise ValueError('Invalid backup file.')
    if len(notes) > LIMITS['notes'] or len(goals) > LIMITS['goals'] or len(habits) > LIMITS['habits']:
        raise ValueError('Backup has too many items.')

    clean_notes = []
    for n in notes:
        c = _clean_note(n)
        c.update(created=_iso(n.get('created')), updated=_iso(n.get('updated')))
        clean_notes.append(c)
    clean_goals = []
    for g in goals:
        c = _clean_goal(g)
        c.update(created=_iso(g.get('created')), updated=_iso(g.get('updated')))
        clean_goals.append(c)
    clean_habits = []
    for h in habits:
        clean_habits.append({'name': _s(h.get('name'), 60, 'Habit name', required=True),
                             'archived': 1 if h.get('archived') else 0,
                             'days': sorted({_day(d) for d in (h.get('days') or [])[:5000]})})

    with _db() as c:
        if mode == 'replace':
            for t in ('checkins', 'habits', 'goals', 'notes'):
                c.execute(f'DELETE FROM {t}')
        elif (_count(c, 'notes') + len(clean_notes) > LIMITS['notes'] or _count(c, 'goals') + len(clean_goals) > LIMITS['goals']):
            raise ValueError('Merging would exceed the item limits.')
        for n in clean_notes:
            c.execute('INSERT INTO notes (title, body, tag, pinned, created, updated) VALUES (?,?,?,?,?,?)',
                      (n['title'], n['body'], n['tag'], n['pinned'], n['created'], n['updated']))
        for g in clean_goals:
            c.execute('INSERT INTO goals (title, description, target_date, milestones, status, created, updated) VALUES (?,?,?,?,?,?,?)',
                      (g['title'], g['description'], g['target_date'], g['milestones'], g['status'], g['created'], g['updated']))
        for h in clean_habits:
            row = c.execute('SELECT id FROM habits WHERE lower(name)=lower(?)', (h['name'],)).fetchone()
            if row:
                hid = row['id']
            else:
                if _count(c, 'habits') >= LIMITS['habits']:
                    raise ValueError('Habit limit reached.')
                hid = c.execute('INSERT INTO habits (name, archived, created) VALUES (?,?,?)', (h['name'], h['archived'], _now())).lastrowid
            c.executemany('INSERT OR IGNORE INTO checkins (habit_id, day) VALUES (?,?)', [(hid, d) for d in h['days']])
    return jsonify({'ok': True, 'notes': len(clean_notes), 'goals': len(clean_goals), 'habits': len(clean_habits)})