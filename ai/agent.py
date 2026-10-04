"""
Portfolio AI Agent (advanced).

Pipeline per message:
  1. Guard      - blocks prompt-injection style messages.
  2. Intents    - typo-tolerant rule router answers instantly from data/*.json and can
                  attach rich cards, a page link and client actions (theme, terminal).
  3. Gemini     - streams a grounded answer, tries a chain of models, caches repeats.
  4. Fallback   - friendly message if nothing above could answer.

stream_response() yields events:  meta -> delta* -> done   (see app.py / script.js)
"""
import os
import re
import json
import time
import difflib
from collections import OrderedDict

from ai import knowledge
from ai.prompts import SYSTEM_INSTRUCTION

try:
    from google import genai
except ImportError:  # rule-based answers keep working without the SDK
    genai = None

MAX_HISTORY_TURNS = 6
DEFAULT_SUGGESTIONS = ['Show my projects', 'What are my skills?', 'Why should I hire Ayushman?', 'Show my certificates']
FOLLOWUPS = ['Show my projects', 'What are my skills?', 'How can I contact Ayushman?']

_client = None
_CACHE = OrderedDict()
_CACHE_MAX = 100

_INJECTION = re.compile(
    r"(ignore|forget|disregard|override).{0,40}(instruction|rule|prompt)"
    r"|(reveal|show|print|repeat|leak).{0,25}(system prompt|your prompt|your instructions)"
    r"|\bjailbreak\b|\bdeveloper mode\b",
    re.I)

TECH_ALIASES = {'js': 'JavaScript', 'genai': 'Generative AI', 'gen ai': 'Generative AI', 'py': 'Python'}


# ---------------------------------------------------------------- Gemini ----
def _models():
    raw = os.environ.get('GEMINI_MODELS') or os.environ.get('GEMINI_MODEL') or 'gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash-lite'
    return [m.strip() for m in raw.split(',') if m.strip()]


def _get_client():
    global _client
    if _client is not None:
        return _client
    key = os.environ.get('GEMINI_API_KEY')
    if not key or genai is None:
        return None
    try:
        _client = genai.Client(api_key=key)
        return _client
    except Exception as e:
        print('Gemini init error:', repr(e))
        return None


def _live_stats():
    """Real Level / XP / streak from the Developer ID system."""
    try:
        import xp_engine
        p, s = xp_engine.get_progress(), xp_engine.get_activity_stats()
        return {'level': p['level'], 'title': p['title'], 'total_xp': p['total_xp'],
                'xp_to_next_level': p['xp_to_next'], 'activity_streak_days': s['streak'],
                'active_days': s['active_days']}
    except Exception:
        return None


def _build_context():
    return json.dumps({
        'profile': knowledge.get_profile(),
        'education': knowledge.get_education(),
        'skills': knowledge.get_skills(),
        'projects': knowledge.get_projects(),
        'certificates': knowledge.get_certificates(),
        'developer_stats': _live_stats(),
    }, indent=2)


def _build_prompt(message, history):
    prompt = SYSTEM_INSTRUCTION.format(context=_build_context())
    lines = []
    for turn in (history or [])[-MAX_HISTORY_TURNS * 2:]:
        who = 'Visitor' if turn.get('role') == 'user' else 'Assistant'
        content = str(turn.get('content', ''))[:500]
        if content:
            lines.append(f'{who}: {content}')
    if lines:
        prompt += '\nCONVERSATION SO FAR:\n' + '\n'.join(lines) + '\n'
    return prompt + f'\n<visitor_message>\n{message}\n</visitor_message>\nAssistant:'


def _is_retryable(err):
    """Temporary Google-side problems: overloaded (503), rate limit (429), server errors."""
    code = getattr(err, 'code', None)
    return code in (429, 500, 503, 504) or any(k in str(err) for k in ('UNAVAILABLE', 'RESOURCE_EXHAUSTED'))


def _stream_ai(message, history, state=None):
    """Streams text pieces. Retries once on temporary errors, then tries the next model.
    Sets state['busy'] = True if every model failed because Google was overloaded."""
    client = _get_client()
    if not client:
        return
    prompt = _build_prompt(message, history)
    for model in _models():
        for attempt in range(2):
            started = False
            try:
                for chunk in client.models.generate_content_stream(model=model, contents=prompt):
                    piece = getattr(chunk, 'text', None)
                    if piece:
                        started = True
                        yield piece
                if started:
                    return
                break  # empty reply -> next model
            except Exception as e:
                print(f'GEMINI ERROR {model} (try {attempt + 1}): {type(e).__name__} {getattr(e, "code", "")}')
                if started:
                    return  # partial answer already shown; don't restart
                if _is_retryable(e):
                    if state is not None:
                        state['busy'] = True
                    if attempt == 0:
                        time.sleep(1.5)
                        continue
                break  # give up on this model -> next model

# ---------------------------------------------------------------- intents ---
def _tokens(text):
    return re.findall(r'[a-z0-9+#]+(?:\.[a-z0-9]+)*', text.lower())


def _word(tokens, *words):
    return any(w in tokens for w in words)


def _match(tokens, stems):
    """Prefix match plus fuzzy match, so 'projcts' / 'certifcates' still work."""
    for t in tokens:
        for s in stems:
            if t.startswith(s):
                return True
            if len(t) >= 6 and len(s) >= 6 and difflib.SequenceMatcher(None, t, s).ratio() >= 0.82:
                return True
    return False


def _phrase_has_term(text, term):
    return re.search(r'(?<![a-z0-9])' + re.escape(term.lower()) + r'(?![a-z0-9+#])', text) is not None


def _reply(intent, message, suggestions=None, cards=None, link=None, action=None):
    r = {'message': message, 'source': 'rule', 'intent': intent, 'answered': True,
         'suggestions': suggestions or FOLLOWUPS}
    if cards:
        r['cards'] = cards
    if link:
        r['link'] = link
    if action:
        r['action'] = action
    return r


def _project_cards(projects):
    keys = ('id', 'name', 'description', 'technologies', 'github', 'live')
    return {'type': 'projects', 'items': [{k: p.get(k) for k in keys} for p in projects]}


def _find_tech(text):
    for alias, tech in TECH_ALIASES.items():
        if _phrase_has_term(text, alias):
            return tech
    return next((t for t in knowledge.get_all_technologies() if _phrase_has_term(text, t)), None)


def _find_skill(text):
    for cat in knowledge.get_skills():
        for s in cat['skills']:
            if len(s) > 2 and _phrase_has_term(text, s):
                return s, cat
    return None, None


def _rule_based(message):
    text = message.lower()
    tokens = _tokens(text)
    if not tokens:
        return None
    profile = knowledge.get_profile()

    # greetings / thanks (short messages only)
    if len(tokens) <= 4 and _word(tokens, 'hi', 'hello', 'hey', 'hii', 'namaste', 'hola', 'yo'):
        return _reply('greeting', "Hi! I'm Ayushman's portfolio assistant. Ask me about his projects, skills, certificates, education or how to reach him.", DEFAULT_SUGGESTIONS)
    if len(tokens) <= 5 and _word(tokens, 'thanks', 'thank', 'thx', 'shukriya', 'dhanyavad'):
        return _reply('thanks', "You're welcome! Anything else you'd like to know about Ayushman's work?")
    if len(tokens) <= 4 and _word(tokens, 'bye', 'goodbye'):
        return _reply('bye', "Thanks for visiting! If you'd like to talk, Ayushman's contact page is one click away.",
                      link={'url': '/contact', 'label': 'Go to contact page'})

    # UI control: theme / terminal
    if _match(tokens, ['theme', 'mode', 'switch', 'change', 'turn', 'enable']):
        for word, theme in (('dark', 'cinematic'), ('cinematic', 'cinematic'), ('light', 'light'),
                            ('terminal', 'terminal'), ('hacker', 'terminal')):
            if word in tokens:
                label = {'cinematic': 'Dark', 'light': 'Light', 'terminal': 'Terminal'}[theme]
                return _reply('theme', f'Done — switched to the {label} theme.',
                              ['Show my projects', 'Open the terminal', 'What are my skills?'],
                              action={'type': 'set_theme', 'theme': theme})
    if 'terminal' in tokens and _match(tokens, ['open', 'show', 'launch', 'start', 'run']):
        return _reply('terminal', 'Opening the command terminal — type "help" inside it to see commands.',
                      action={'type': 'open_terminal'})

    # live Developer ID stats
    if _match(tokens, ['level', 'xp', 'streak', 'rank']) or 'developer id' in text:
        s = _live_stats()
        if s:
            return _reply('stats',
                          f"Ayushman is **Level {s['level']} — {s['title']}** with {s['total_xp']} XP "
                          f"({s['xp_to_next_level']} XP to the next level) and a {s['activity_streak_days']}-day activity streak.",
                          ['Show GitHub activity', 'Show my projects', 'What are my skills?'],
                          link={'url': '/developer', 'label': 'Open Developer ID card'})

    # GitHub activity page
    if 'github' in tokens and _match(tokens, ['activity', 'commit', 'contribution', 'repo', 'stat']):
        return _reply('github', "Here's Ayushman's live GitHub activity — it syncs real commits and repos into his Developer XP.",
                      link={'url': '/github', 'label': 'View GitHub activity'})

    # "which projects use X"
    tech = _find_tech(text)
    if tech and _match(tokens, ['project', 'use', 'using', 'built', 'made', 'build', 'app', 'work']):
        matches = [p for p in knowledge.get_projects() if tech in p['technologies']]
        if matches:
            n = len(matches)
            return _reply('tech_projects', f"{n} project{'s' if n != 1 else ''} use{'' if n != 1 else 's'} **{tech}**:",
                          ['Show all projects', 'What are my skills?', 'Show my certificates'],
                          cards=_project_cards(matches),
                          link={'url': '/projects?highlight=' + ','.join(p['id'] for p in matches), 'label': 'Highlight on projects page'})

    if _match(tokens, ['project', 'portfolio work']) or 'work you' in text:
        projects = knowledge.get_projects()
        return _reply('projects', f'Ayushman has built {len(projects)} projects:',
                      ['Which projects use Flask?', 'What are my skills?', 'Why should I hire Ayushman?'],
                      cards=_project_cards(projects), link={'url': '/projects', 'label': 'Open projects page'})

    # specific skill ("does he know MySQL?") vs overview
    skill, cat = _find_skill(text)
    overview = _match(tokens, ['skill', 'technolog', 'stack', 'expertise', 'proficien'])
    if skill and not overview:
        used_in = [p['name'] for p in knowledge.get_projects() if skill in p['technologies']]
        extra = f" He used it in {', '.join(used_in)}." if used_in else ''
        return _reply('skill', f"Yes — **{skill}** is part of Ayushman's {cat['category'].lower()} skills.{extra}",
                      ['Which projects use Flask?', 'Show my projects', 'Show my certificates'],
                      cards={'type': 'skills', 'items': [cat]})
    if overview:
        return _reply('skills', "Here's Ayushman's skill set, grouped by area:",
                      ['Which projects use Python?', 'Show my projects', 'Show my certificates'],
                      cards={'type': 'skills', 'items': knowledge.get_skills()},
                      link={'url': '/skills', 'label': 'Open skills page'})

    if _match(tokens, ['certif', 'course', 'credential']):
        certs = knowledge.get_certificates()
        return _reply('certificates', f'Ayushman has earned {len(certs)} certificates:',
                      ['Show my projects', 'What are my skills?', 'How can I contact Ayushman?'],
                      cards={'type': 'certificates', 'items': certs},
                      link={'url': '/certificates', 'label': 'Open certificates page'})

    if _match(tokens, ['educat', 'college', 'degree', 'stud', 'universit', 'gniot', 'btech']) or 'b.tech' in text:
        e = knowledge.get_education()[0]
        return _reply('education', f"**{e['degree']}** at {e['institution']} — {e['status']}.",
                      ['Show my projects', 'What are my skills?', 'Show my certificates'])

    if _match(tokens, ['contact', 'email', 'reach', 'linkedin', 'instagram', 'connect']):
        return _reply('contact',
                      f"You can email Ayushman at {profile['email']}, connect on LinkedIn ({profile['linkedin']}) "
                      f"or follow his code on GitHub ({profile['github']}).",
                      ['Is he open to work?', 'Show my projects', 'What are my skills?'],
                      link={'url': '/contact', 'label': 'Go to contact page'})

    if _match(tokens, ['availab', 'internship', 'hiring', 'opportunit']) or 'open to work' in text or 'looking for' in text:
        return _reply('status', f"{profile['status']}. The fastest way to reach him is by email: {profile['email']}.",
                      ['Why should I hire Ayushman?', 'Show my projects', 'How can I contact Ayushman?'],
                      link={'url': '/contact', 'label': 'Go to contact page'})

    if _match(tokens, ['about', 'bio', 'introduc', 'yourself']) or 'who is' in text or 'who are' in text:
        return _reply('about', profile['bio'], ['Show my projects', 'What are my skills?', 'Why should I hire Ayushman?'],
                      link={'url': '/about', 'label': 'Read the About page'})

    return None


# ---------------------------------------------------------------- public ----
def _cache_get(key):
    if key in _CACHE:
        _CACHE.move_to_end(key)
        return _CACHE[key]
    return None


def _cache_put(key, value):
    _CACHE[key] = value
    _CACHE.move_to_end(key)
    while len(_CACHE) > _CACHE_MAX:
        _CACHE.popitem(last=False)


def stream_response(message, history=None):
    """Yields {'type': 'meta'|'delta'|'done', ...} events."""
    if _INJECTION.search(message):
        yield {'type': 'meta', 'data': {
            'message': "I can only help with questions about Ayushman's portfolio — projects, skills, certificates, education and contact.",
            'source': 'guard', 'answered': True, 'suggestions': DEFAULT_SUGGESTIONS}}
        yield {'type': 'done', 'data': {}}
        return

    rule = _rule_based(message)
    if rule:
        yield {'type': 'meta', 'data': rule}
        yield {'type': 'done', 'data': {}}
        return

    cache_key = ' '.join(_tokens(message)) if not history else None
    cached = _cache_get(cache_key) if cache_key else None
    if cached:
        yield {'type': 'meta', 'data': {'message': cached, 'source': 'cache', 'answered': True, 'suggestions': FOLLOWUPS}}
        yield {'type': 'done', 'data': {}}
        return

    parts = []
    state = {}
    for piece in _stream_ai(message, history, state):
        if not parts:
            yield {'type': 'meta', 'data': {'source': 'gemini', 'answered': True, 'suggestions': FOLLOWUPS}}
        parts.append(piece)
        yield {'type': 'delta', 'text': piece}

    if parts:
        if cache_key:
            _cache_put(cache_key, ''.join(parts).strip())
        yield {'type': 'done', 'data': {}}
        return
    if state.get('busy'):
        yield {'type': 'meta', 'data': {
            'message': "The AI is a bit busy right now — please try again in a few seconds. Meanwhile I can still answer instantly about projects, skills, certificates, education and contact.",
            'source': 'ai_busy', 'answered': True, 'suggestions': DEFAULT_SUGGESTIONS}}
        yield {'type': 'done', 'data': {}}
        return
    yield {'type': 'meta', 'data': {
        'message': "I couldn't find that in the portfolio. Try asking about projects, skills, certificates, education or contact details.",
        'source': 'fallback', 'answered': False, 'suggestions': DEFAULT_SUGGESTIONS}}
    yield {'type': 'done', 'data': {}}


def generate_response(message, history=None):
    """Non-streaming version (used by /api/ai)."""
    payload, text = {}, ''
    for ev in stream_response(message, history):
        if ev['type'] == 'meta':
            payload.update(ev['data'])
            text = ev['data'].get('message', text)
        elif ev['type'] == 'delta':
            text += ev['text']
    payload['message'] = text.strip()
    return payload