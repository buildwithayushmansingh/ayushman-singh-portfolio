from flask import Flask, render_template, request, jsonify
import xp_engine
import github_sync
import ai.agent as ai_agent

app = Flask(__name__)

xp_engine.init_db()
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

@app.route('/api/ai', methods=['POST'])
def api_ai():
    """Portfolio AI Agent endpoint. Phase 3: answers from real portfolio
    data only — no external AI provider yet (that's Phase 4)."""
    data = request.get_json(silent=True) or {}
    message = (data.get('message') or '').strip()

    if not message:
        return jsonify({'error': 'Please enter a message.'}), 400
    if len(message) > 500:
        return jsonify({'error': 'That message is too long — please keep it under 500 characters.'}), 400

    try:
        result = ai_agent.generate_response(message)
        return jsonify(result)
    except Exception:
        # never leak a Python traceback to visitors
        return jsonify({'error': 'AI assistant is temporarily unavailable. Please try again.'}), 500
# real, developer-configurable status shown on the ID card — not automatic
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
