"""
Portfolio AI Agent - Nexus edition.

Pipeline per message:
  1. Guard    - blocks prompt-injection style messages.
  2. Intents  - typo-tolerant rule router: instant answers + rich cards + UI actions
                (project spotlight, compare, job-fit /match, contact form, theme, ...).
  3. Gemini   - streams a grounded answer in the chosen mode, retries, model chain, cache.
  4. Fallback - friendly message if nothing above could answer.

stream_response() yields events:  meta -> delta* -> done
"""
import os
import re
import json
import time
import random
import difflib
from collections import OrderedDict

from ai import knowledge
from ai.prompts import SYSTEM_INSTRUCTION, MODE_STYLES

try:
    from google import genai
except ImportError:  # rule-based answers keep working without the SDK
    genai = None

MAX_HISTORY_TURNS = 6
DEFAULT_SUGGESTIONS = ['Show my projects', 'Why should I hire Ayushman?', "What's your Developer level?", 'Surprise me']
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

# words we look for inside a pasted job description (/match)
TECH_VOCAB = ['python', 'java', 'javascript', 'typescript', 'react', 'angular', 'vue', 'node', 'flask', 'django',
              'fastapi', 'sql', 'mysql', 'postgresql', 'mongodb', 'sqlite', 'html', 'css', 'git', 'github', 'docker',
              'kubernetes', 'aws', 'azure', 'gcp', 'linux', 'rest', 'api', 'c++', 'c#', 'php', 'tailwind', 'bootstrap',
              'machine learning', 'ai', 'nlp', 'pandas', 'numpy', 'tensorflow', 'pytorch', 'figma', 'redis', 'graphql',
              'spring', 'express', 'data analysis', 'responsive']
DISPLAY = {'javascript': 'JavaScript', 'typescript': 'TypeScript', 'mysql': 'MySQL', 'sqlite': 'SQLite',
           'postgresql': 'PostgreSQL', 'mongodb': 'MongoDB', 'github': 'GitHub', 'graphql': 'GraphQL',
           'fastapi': 'FastAPI', 'nlp': 'NLP', 'git': 'Git', 'pytorch': 'PyTorch', 'tensorflow': 'TensorFlow',
           'html': 'HTML', 'css': 'CSS', 'aws': 'AWS', 'gcp': 'GCP', 'php': 'PHP', 'sql': 'SQL', 'api': 'API',
           'ai': 'AI', 'rest': 'REST', 'c++': 'C++', 'c#': 'C#', 'numpy': 'NumPy', 'node': 'Node.js'}
SKILL_ALIASES = {'sql': {'mysql', 'sqlite'}, 'rest': {'rest apis'}, 'api': {'rest apis'},
                 'responsive': {'responsive ui'}, 'ai': {'generative ai'}}
GENERIC_NAME_WORDS = {'project', 'projects', 'personal', 'portfolio', 'private', 'app'}


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
        'extra_knowledge': [{'topic': e['topic'], 'answer': e['answer']} for e in _extra_entries()],
    }, indent=2)


def _build_prompt(message, history, mode):
    prompt = SYSTEM_INSTRUCTION.format(context=_build_context(), mode_style=MODE_STYLES.get(mode, MODE_STYLES['auto']))
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


def _stream_ai(message, history, mode, state=None):
    """Streams text pieces. Retries once on temporary errors, then tries the next model."""
    client = _get_client()
    if not client:
        return
    prompt = _build_prompt(message, history, mode)
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
                    return
                if _is_retryable(e):
                    if state is not None:
                        state['busy'] = True
                    if attempt == 0:
                        time.sleep(1.5)
                        continue
                break


# ---------------------------------------------------------------- helpers ---
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


def _has_term(text, term):
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


def _spotlight(p):
    keys = ('id', 'name', 'description', 'technologies', 'github', 'live')
    return {'type': 'spotlight', 'items': [{k: p.get(k) for k in keys}]}


def _find_tech(text):
    for alias, tech in TECH_ALIASES.items():
        if _has_term(text, alias):
            return tech
    return next((t for t in knowledge.get_all_technologies() if _has_term(text, t)), None)


def _find_skill(text):
    for cat in knowledge.get_skills():
        for s in cat['skills']:
            if len(s) > 2 and _has_term(text, s):
                return s, cat
    return None, None


def _project_keys(p):
    keys = {p['name'].lower(), p['id'].replace('-', ' ')}
    keys.update(t for t in _tokens(p['name']) if len(t) >= 5 and t not in GENERIC_NAME_WORDS)
    return keys


def _find_projects(text):
    """Projects mentioned by name, in the order they appear."""
    found = []
    for p in knowledge.get_projects():
        hits = [m.start() for k in _project_keys(p) for m in [re.search(r'(?<![a-z0-9])' + re.escape(k) + r'(?![a-z0-9])', text)] if m]
        if hits:
            found.append((min(hits), p))
    return [p for _, p in sorted(found, key=lambda x: x[0])]


def mode_suggestions(mode):
    names = [p['name'] for p in knowledge.get_projects()]
    return {
        'recruiter': ['Why should I hire Ayushman?', 'Is he open to work?', 'Send a message to Ayushman', 'Show resume'],
        'tech': ['Which projects use Flask?', 'What are my skills?', f'Compare {names[0]} and {names[1]}' if len(names) > 1 else 'Show my projects', '/match'],
        'casual': ['Surprise me', 'Show my projects', 'Tell me about Ayushman', "What's your Developer level?"],
    }.get(mode, DEFAULT_SUGGESTIONS)


# ------------------------------------------------------- job-fit (/match) ---
def _has_skill(term, have):
    if term in have:
        return True
    if any(term in re.split(r'[\s&/,\-]+', h) for h in have):
        return True
    return bool(SKILL_ALIASES.get(term, set()) & have)


def _job_match(jd):
    text = jd.lower()
    wanted = [t for t in TECH_VOCAB if _has_term(text, t)]
    have = {s.lower() for cat in knowledge.get_skills() for s in cat['skills']}
    have |= {t.lower() for p in knowledge.get_projects() for t in p.get('technologies', [])}
    matched = [t for t in wanted if _has_skill(t, have)]
    missing = [t for t in wanted if t not in matched]
    if not wanted:
        return None
    score = round(100 * len(matched) / len(wanted))
    verdict = 'Strong match' if score >= 75 else 'Good match, a few gaps' if score >= 50 else 'Partial match — room to grow'
    names = lambda ts: [DISPLAY.get(t, t.title()) for t in ts]
    relevant = [p['name'] for p in knowledge.get_projects()
                if any(_has_skill(t, {x.lower() for x in p.get('technologies', [])}) for t in matched)]
    return {'type': 'match', 'score': score, 'verdict': verdict,
            'matched': names(matched), 'missing': names(missing), 'projects': relevant}


# ------------------------------------------- personal knowledge (about_me.json) ---
EXTRA_PATH = os.path.join(knowledge.DATA_DIR, 'about_me.json')
_extra_cache = {'mtime': None, 'entries': []}


def _extra_entries():
    """Q&A entries Ayushman wrote himself. Reloaded automatically when the file changes."""
    try:
        mtime = os.path.getmtime(EXTRA_PATH)
    except OSError:
        return []
    if _extra_cache['mtime'] != mtime:
        try:
            with open(EXTRA_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print('about_me.json error:', repr(e))
            return _extra_cache['entries']
        entries = []
        for item in data.get('facts', []):
            answer = (item.get('answer') or '').strip()
            if answer:
                entries.append({'topic': (item.get('topic') or '').strip(),
                                'keywords': [k.lower() for k in item.get('keywords', [])],
                                'answer': answer})
        _extra_cache.update(mtime=mtime, entries=entries)
    return _extra_cache['entries']


def _kb_match(text, tokens, min_score=1.5):
    best, best_score = None, 0
    for e in _extra_entries():
        score = 0
        for kw in set(e['keywords'] + [e['topic'].lower()]):
            if not kw:
                continue
            if ' ' in kw:
                score += 2 if kw in text else 0
            elif kw in tokens:
                score += 1.5
            elif len(kw) >= 5 and _match(tokens, [kw]):
                score += 1
        if score > best_score:
            best, best_score = e, score
    return best if best_score >= min_score else None


def _topic_suggestions(exclude=None):
    topics = [e['topic'] for e in _extra_entries() if e['topic'] and e is not exclude]
    return [f"Tell me about his {t.lower()}" for t in topics[:2]]


def _profile_card():
    p = knowledge.get_profile()
    return {'type': 'profile', 'name': p['name'], 'title': p['title'], 'location': p.get('location', ''),
            'tagline': p.get('tagline', ''), 'status': p.get('status', ''), 'photo': '/static/images/profile.jpg',
            'github': p.get('github'), 'linkedin': p.get('linkedin'), 'email': p.get('email')}


def _pitch():
    """A positive, fully data-backed summary - works even when Gemini is down."""
    projects, skills, certs = knowledge.get_projects(), knowledge.get_skills(), knowledge.get_certificates()
    profile, stats = knowledge.get_profile(), _live_stats()
    lines = ["Here's why Ayushman is worth a conversation:",
             f"- **Ships real projects** — {len(projects)} built so far: {', '.join(p['name'] for p in projects)}",
             f"- **Full-stack range** — {', '.join(c['category'].lower() for c in skills[:4])}"]
    if certs:
        lines.append(f"- **Always learning** — {len(certs)} certificates, including {certs[0]['name']}")
    if stats:
        lines.append(f"- **Consistent growth** — Level {stats['level']} ({stats['title']}) on his Developer ID with {stats['total_xp']} XP")
    lines.append(f"- **Available** — {profile.get('status', 'open to opportunities')}")
    return _reply('pitch', '\n'.join(lines), ['Show my projects', 'Send a message to Ayushman', 'What are my skills?'],
                  link={'url': '/contact', 'label': 'Go to contact page'})


def _deflect():
    """Honest + positive reply when nothing in the data matches (never invents facts)."""
    profile = knowledge.get_profile()
    first = profile['bio'].split('. ')[0].rstrip('.') + '.'
    r = _reply('deflect',
               f"That specific detail isn't on Ayushman's portfolio yet — but here's what I can tell you: {first} "
               f"For anything more personal, the quickest way is to message him directly.",
               ['Send a message to Ayushman', 'Show my projects', 'Why should I hire Ayushman?'],
               cards=_profile_card(), link={'url': '/contact', 'label': 'Go to contact page'})
    r['answered'] = False        # shows up in /admin/ai-stats so you know what to add to about_me.json
    return r


def _offline_answer(message):
    """Best local answer when Gemini can't help (busy, no key, quota)."""
    text = message.lower()
    tokens = _tokens(text)
    if _match(tokens, ['hire', 'strength', 'standout']) or 'stand out' in text or 'good at' in text or 'why should' in text:
        return _pitch()
    e = _kb_match(text, tokens, min_score=1)
    if e:
        return _reply('kb', e['answer'], _topic_suggestions(e) + ['Show my projects'])
    return None


# ---------------------------------------------------------------- intents ---
def _rule_based(message):
    text = message.lower().strip()
    tokens = _tokens(text)
    if not tokens:
        return None
    profile = knowledge.get_profile()
    projects = knowledge.get_projects()

    # /match <job description>
    if text.startswith('/match'):
        jd = message.strip()[6:].strip()
        if len(jd) < 15:
            return _reply('match_help', 'Paste a job description after the command, like `/match Looking for a Python Flask developer with SQL and REST API experience`. I\'ll score how well Ayushman\'s skills fit.', ['Show my skills' if False else 'What are my skills?', 'Why should I hire Ayushman?'])
        result = _job_match(jd)
        if not result:
            return _reply('match_none', "I couldn't spot specific technologies in that text. Try pasting the requirements section of the job description.",
                          ['What are my skills?', 'Show my projects'])
        return _reply('match', f"**{result['score']}% skill match** — {result['verdict']}. This compares the technologies named in the description with Ayushman's skills and projects.",
                      ['Show my projects', 'Send a message to Ayushman', 'Why should I hire Ayushman?'], cards=result)

    # greetings / thanks / help
    if len(tokens) <= 4 and _word(tokens, 'hi', 'hello', 'hey', 'hii', 'namaste', 'hola', 'yo'):
        return _reply('greeting', "Hi! I'm Ayushman's portfolio assistant. Ask me about his projects, skills, certificates or how to reach him — or type `/` to see everything I can do.", DEFAULT_SUGGESTIONS)
    if len(tokens) <= 5 and _word(tokens, 'thanks', 'thank', 'thx', 'shukriya', 'dhanyavad'):
        return _reply('thanks', "You're welcome! Anything else you'd like to know about Ayushman's work?")
    if len(tokens) <= 4 and _word(tokens, 'bye', 'goodbye'):
        return _reply('bye', "Thanks for visiting! If you'd like to talk, Ayushman's contact page is one click away.",
                      link={'url': '/contact', 'label': 'Go to contact page'})
    if _word(tokens, 'help', 'commands') or 'what can you do' in text:
        return _reply('help', "Here's what I can do:\n- **Answer** about projects, skills, certificates, education\n- **Spotlight** or **compare** projects (`Compare A and B`)\n- **Score a job fit** with `/match <job description>`\n- **Show live stats** like Developer level and XP\n- **Switch theme**, open the terminal, or help you **message** Ayushman\n- Switch my tone with the **Recruiter / Tech / Casual** tabs",
                      ['Show my projects', 'Surprise me', '/match'])

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

    if 'github' in tokens and _match(tokens, ['activity', 'commit', 'contribution', 'repo', 'stat']):
        return _reply('github', "Here's Ayushman's live GitHub activity — it syncs real commits and repos into his Developer XP.",
                      link={'url': '/github', 'label': 'View GitHub activity'})

    # surprise me
    if _word(tokens, 'surprise', 'random') or 'fun fact' in text:
        p = random.choice(projects)
        return _reply('surprise', f"Here's a random pick from Ayushman's work — **{p['name']}**:",
                      ['Surprise me', 'Show my projects', 'Why should I hire Ayushman?'], cards=_spotlight(p),
                      link={'url': '/projects?highlight=' + p['id'], 'label': 'Highlight on projects page'})

    # compare projects / project spotlight
    found = _find_projects(text)
    tech = _find_tech(text)
    wants_compare = _match(tokens, ['compar', 'versus', 'differ']) or ' vs ' in f' {text} '
    if wants_compare:
        if len(found) >= 2:
            a, b = found[0], found[1]
            ta, tb = a.get('technologies', []), b.get('technologies', [])
            shared = [t for t in ta if t in tb]
            msg = (f"**{a['name']}** vs **{b['name']}** — they share {len(shared)} technolog{'y' if len(shared) == 1 else 'ies'}."
                   if shared else f"**{a['name']}** and **{b['name']}** use completely different stacks.")
            return _reply('compare', msg, ['Show my projects', 'Which projects use Flask?', 'Surprise me'],
                          cards={'type': 'compare', 'items': [
                              {'id': a['id'], 'name': a['name'], 'technologies': ta},
                              {'id': b['id'], 'name': b['name'], 'technologies': tb}], 'shared': shared})
        if len(projects) > 1:
            return _reply('compare_help', f"Tell me which two to compare — for example: `Compare {projects[0]['name']} and {projects[1]['name']}`.",
                          [f"Compare {projects[0]['name']} and {projects[1]['name']}", 'Show my projects'])

    which_tech = tech and _word(tokens, 'use', 'uses', 'using', 'built', 'made', 'which', 'any')
    if len(found) == 1 and not which_tech:
        p = found[0]
        return _reply('spotlight', f"**{p['name']}** is built with {', '.join(p.get('technologies', []))}.",
                      ['Compare my projects', 'Show my projects', 'Which projects use Flask?'], cards=_spotlight(p),
                      link={'url': '/projects?highlight=' + p['id'], 'label': 'Highlight on projects page'})

    # "which projects use X"
    if tech and _match(tokens, ['project', 'use', 'using', 'built', 'made', 'build', 'app', 'work']):
        matches = [p for p in projects if tech in p['technologies']]
        if matches:
            n = len(matches)
            return _reply('tech_projects', f"{n} project{'s' if n != 1 else ''} use{'' if n != 1 else 's'} **{tech}**:",
                          ['Show all projects', 'What are my skills?', 'Show my certificates'],
                          cards=_project_cards(matches),
                          link={'url': '/projects?highlight=' + ','.join(p['id'] for p in matches), 'label': 'Highlight on projects page'})

    if _match(tokens, ['project', 'portfolio work']) or 'work you' in text:
        return _reply('projects', f'Ayushman has built {len(projects)} projects:',
                      ['Which projects use Flask?', 'Compare my projects', 'Why should I hire Ayushman?'],
                      cards=_project_cards(projects), link={'url': '/projects', 'label': 'Open projects page'})

    # specific skill vs overview
    skill, cat = _find_skill(text)
    overview = _match(tokens, ['skill', 'technolog', 'stack', 'expertise', 'proficien'])
    if skill and not overview:
        used_in = [p['name'] for p in projects if skill in p['technologies']]
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

    # resume
    if _word(tokens, 'resume', 'cv', 'curriculum'):
        return _reply('resume', "Ayushman's resume button in the top bar opens his LinkedIn profile, which has his full background.",
                      ['Send a message to Ayushman', 'Is he open to work?', 'Show my projects'],
                      link={'url': profile['linkedin'], 'label': 'Open LinkedIn profile'})

    # write a message (in-chat mini form)
    if any(p in text for p in ('send a message', 'send message', 'write to', 'message ayushman', 'message him',
                               'leave a message', 'drop a message', 'get in touch', 'email him')):
        return _reply('message_form', "Sure — write your message below and I'll open it in your email app, addressed to Ayushman.",
                      ['Is he open to work?', 'Show my projects'],
                      cards={'type': 'contact_form', 'email': profile['email']})

    if _match(tokens, ['contact', 'email', 'reach', 'linkedin', 'instagram', 'connect']):
        return _reply('contact',
                      f"You can email Ayushman at {profile['email']}, connect on LinkedIn ({profile['linkedin']}) "
                      f"or follow his code on GitHub ({profile['github']}).",
                      ['Send a message to Ayushman', 'Is he open to work?', 'Show my projects'],
                      link={'url': '/contact', 'label': 'Go to contact page'})

    if _match(tokens, ['availab', 'internship', 'hiring', 'opportunit']) or 'open to work' in text or 'looking for' in text:
        return _reply('status', f"{profile['status']}. The fastest way to reach him is by email: {profile['email']}.",
                      ['Why should I hire Ayushman?', 'Send a message to Ayushman', 'Show my projects'],
                      link={'url': '/contact', 'label': 'Go to contact page'})

    # personal Q&A that Ayushman wrote himself (hobbies, goals, strengths, ...)
    entry = _kb_match(text, tokens)
    if entry:
        return _reply('kb', entry['answer'], _topic_suggestions(entry) + ['Show my projects'])

    if (_match(tokens, ['bio', 'introduc', 'yourself']) or 'who is' in text or 'who are' in text
            or (_word(tokens, 'about') and _word(tokens, 'ayushman', 'him', 'you', 'himself', 'me', 'portfolio') and len(tokens) <= 6)):
        return _reply('about', profile['bio'], ['Why should I hire Ayushman?', 'Show my projects', 'What are my skills?'] + _topic_suggestions()[:1],
                      cards=_profile_card(), link={'url': '/about', 'label': 'Read the About page'})

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


def stream_response(message, history=None, mode='auto'):
    """Yields {'type': 'meta'|'delta'|'done', ...} events."""
    mode = mode if mode in MODE_STYLES else 'auto'
    sugg = mode_suggestions(mode)

    if _INJECTION.search(message):
        yield {'type': 'meta', 'data': {
            'message': "I can only help with questions about Ayushman's portfolio — projects, skills, certificates, education and contact.",
            'source': 'guard', 'answered': True, 'suggestions': sugg}}
        yield {'type': 'done', 'data': {}}
        return

    rule = _rule_based(message)
    if rule:
        yield {'type': 'meta', 'data': rule}
        yield {'type': 'done', 'data': {}}
        return

    cache_key = (mode + '|' + ' '.join(_tokens(message))) if not history else None
    cached = _cache_get(cache_key) if cache_key else None
    if cached:
        yield {'type': 'meta', 'data': {'message': cached, 'source': 'cache', 'answered': True, 'suggestions': FOLLOWUPS}}
        yield {'type': 'done', 'data': {}}
        return

    parts, state = [], {}
    for piece in _stream_ai(message, history, mode, state):
        if not parts:
            yield {'type': 'meta', 'data': {'source': 'gemini', 'answered': True, 'suggestions': FOLLOWUPS}}
        parts.append(piece)
        yield {'type': 'delta', 'text': piece}

    if parts:
        if cache_key:
            _cache_put(cache_key, ''.join(parts).strip())
        yield {'type': 'done', 'data': {}}
        return

    offline = _offline_answer(message)
    if offline:
        yield {'type': 'meta', 'data': offline}
        yield {'type': 'done', 'data': {}}
        return

    if state.get('busy'):
        yield {'type': 'meta', 'data': {
            'message': "The AI is a bit busy right now — please try again in a few seconds. Meanwhile I can still answer instantly about projects, skills, certificates, education and contact.",
            'source': 'ai_busy', 'answered': True, 'suggestions': sugg}}
        yield {'type': 'done', 'data': {}}
        return

    yield {'type': 'meta', 'data': _deflect()}
    yield {'type': 'done', 'data': {}}


def generate_response(message, history=None, mode='auto'):
    """Non-streaming version (used by /api/ai)."""
    payload, text = {}, ''
    for ev in stream_response(message, history, mode):
        if ev['type'] == 'meta':
            payload.update(ev['data'])
            text = ev['data'].get('message', text)
        elif ev['type'] == 'delta':
            text += ev['text']
    payload['message'] = text.strip()
    return payload