import os
import json
import time
import hmac
from flask import Flask, render_template, request, jsonify, Response, stream_with_context, abort
from dotenv import load_dotenv

load_dotenv()

import xp_engine
import github_sync
import ai.agent as ai_agent
import ai.store as ai_store 
app = Flask(__name__)

xp_engine.init_db()
ai_store.init() 
xp_engine.seed_initial_xp()


@app.context_processor
def inject_dev_progress():
    """Makes dev_progress available in every template automatically — real
    Level/XP/Title computed server-side, never client-editable. XP only
    comes from real project/certificate milestones and real GitHub
    activity — no generic achievement bonuses."""
    github_sync.sync_github_xp()
    return {
        'dev_progress': xp_engine.get_progress(),
        'dev_stats': xp_engine.get_activity_stats(),
        'dev_card_id': xp_engine.get_card_id(),
    }

# label shown in the sections menu / page title for each route
SECTIONS = [
    {'slug': 'about', 'label': 'About'},
    {'slug': 'skills', 'label': 'Skills'},
    {'slug': 'projects', 'label': 'Projects'},
    {'slug': 'certificates', 'label': 'Certificates'},
    {'slug': 'github', 'label': 'GitHub Activity'},
    {'slug': 'contact', 'label': 'Contact'},
]

@app.route('/')
def home():
    """Landing page — hero only. Other sections live on their own pages,
    reachable from the sections icon in the top bar."""
    return render_template('index.html', sections=SECTIONS)


@app.route('/about')
def about():
    return render_template('section.html', section='about', section_label='About', sections=SECTIONS)


@app.route('/skills')
def skills():
    return render_template('section.html', section='skills', section_label='Skills', sections=SECTIONS)


@app.route('/projects')
def projects():
    return render_template('section.html', section='projects', section_label='Projects', sections=SECTIONS)


@app.route('/certificates')
def certificates():
    return render_template('section.html', section='certificates', section_label='Certificates', sections=SECTIONS)

@app.route('/github')
def github():
    today_feed = xp_engine.get_activity_feed(category='github', date_range='today')
    return render_template('section.html', section='github', section_label='GitHub Activity',
                            sections=SECTIONS, today_feed=today_feed)
@app.route('/contact')
def contact():
    return render_template('section.html', section='contact', section_label='Contact', sections=SECTIONS)
# ---------------- AI agent API ----------------
_AI_RATE = {}
AI_LIMIT, AI_WINDOW = 15, 60  # 15 requests / 60s per IP


def _rate_limited(ip):
    now = time.time()
    hits = [t for t in _AI_RATE.get(ip, []) if now - t < AI_WINDOW]
    limited = len(hits) >= AI_LIMIT
    if not limited:
        hits.append(now)
    _AI_RATE[ip] = hits
    if len(_AI_RATE) > 2000:  # keep memory bounded
        for k in [k for k, v in _AI_RATE.items() if not v or now - v[-1] > AI_WINDOW]:
            _AI_RATE.pop(k, None)
    return limited


def _ai_request():
    """Validate an AI request -> (message, history, error_response)."""
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown').split(',')[0].strip()
    if _rate_limited(ip):
        return None, None, (jsonify({'error': 'Too many messages — please wait a moment and try again.'}), 429)
    data = request.get_json(silent=True) or {}
    message = (data.get('message') or '').strip()
    history = data.get('history') if isinstance(data.get('history'), list) else []
    history = [h for h in history if isinstance(h, dict)][-12:]
    if not message:
        return None, None, (jsonify({'error': 'Please enter a message.'}), 400)
    if len(message) > 500:
        return None, None, (jsonify({'error': 'That message is too long — please keep it under 500 characters.'}), 400)
    return message, history, None


@app.route('/api/ai/stream', methods=['POST'])
def api_ai_stream():
    """Streaming endpoint: newline-delimited JSON events (meta -> delta* -> done)."""
    message, history, err = _ai_request()
    if err:
        return err

    def generate():
        started = time.time()
        source, answered, parts = 'rule', True, []
        try:
            for ev in ai_agent.stream_response(message, history):
                if ev['type'] == 'meta':
                    d = ev['data']
                    source = d.get('source', source)
                    if d.get('intent'):
                        source = 'rule:' + d['intent']
                    answered = d.get('answered', True)
                    if d.get('message'):
                        parts.append(d['message'])
                elif ev['type'] == 'delta':
                    parts.append(ev['text'])
                elif ev['type'] == 'done':
                    ev['data']['id'] = ai_store.log_chat(
                        message, ''.join(parts).strip(), source, answered, (time.time() - started) * 1000)
                yield json.dumps(ev, ensure_ascii=False) + '\n'
        except Exception:
            import traceback
            traceback.print_exc()
            yield json.dumps({'type': 'error', 'error': 'AI assistant is temporarily unavailable. Please try again.'}) + '\n'

    return Response(stream_with_context(generate()), mimetype='application/x-ndjson',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/ai', methods=['POST'])
def api_ai():
    """Non-streaming JSON endpoint (fallback for browsers without streaming)."""
    message, history, err = _ai_request()
    if err:
        return err
    try:
        return jsonify(ai_agent.generate_response(message, history))
    except Exception:
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'AI assistant is temporarily unavailable. Please try again.'}), 500


@app.route('/api/ai/feedback', methods=['POST'])
def api_ai_feedback():
    data = request.get_json(silent=True) or {}
    try:
        chat_id, rating = int(data.get('id')), int(data.get('rating'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid feedback.'}), 400
    if rating not in (1, -1):
        return jsonify({'error': 'Invalid rating.'}), 400
    ai_store.set_feedback(chat_id, rating)
    return jsonify({'ok': True})


@app.route('/admin/ai-stats')
def ai_stats():
    """Private analytics: /admin/ai-stats?key=YOUR_ADMIN_KEY (set ADMIN_KEY in .env)."""
    key = os.environ.get('ADMIN_KEY', '')
    if not key or not hmac.compare_digest(request.args.get('key', ''), key):
        abort(404)
    return jsonify(ai_store.stats())# real, developer-configurable status shown on the ID card — not automatic
# real, developer-configurable status shown on the ID card — not automatic
DEV_STATUS = 'OPEN TO WORK'


@app.route('/developer')
def developer():
    """The full premium Developer ID card page."""
    share_url = request.host_url.rstrip('/') + '/developer'
    return render_template('developer.html', sections=SECTIONS,
                            section_label='Developer ID', dev_status=DEV_STATUS,
                            share_url=share_url)

if __name__ == '__main__':
    app.run(debug=True, port=5001)
