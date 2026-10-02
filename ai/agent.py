"""
Portfolio AI Agent.

Flow per message:
  1. Rule-based intents answer instantly from data/*.json (free, fast, no hallucination)
     and attach a UI `action` the frontend can act on.
  2. Anything else goes to Gemini, grounded strictly in the same portfolio data.
  3. If Gemini is unavailable, a friendly fallback is returned.
"""
import os
import json
import re
import traceback

from ai import knowledge
from ai.prompts import SYSTEM_INSTRUCTION

try:
    from google import genai
except ImportError:  # keeps rule-based answers working even if the SDK is missing
    genai = None

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
MAX_HISTORY_TURNS = 6

_gemini_client = None


def _get_gemini_client():
    global _gemini_client
    if _gemini_client is not None:
        return _gemini_client
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or genai is None:
        return None
    try:
        _gemini_client = genai.Client(api_key=api_key)
        return _gemini_client
    except Exception as e:
        print("Gemini initialization error:", repr(e))
        return None


def _build_context():
    """Everything the AI is allowed to know - nothing more."""
    return json.dumps({
        'profile': knowledge.get_profile(),
        'education': knowledge.get_education(),
        'skills': knowledge.get_skills(),
        'projects': knowledge.get_projects(),
        'certificates': knowledge.get_certificates(),
    }, indent=2)


def _format_history(history):
    lines = []
    for turn in (history or [])[-MAX_HISTORY_TURNS * 2:]:
        role = 'Visitor' if turn.get('role') == 'user' else 'Assistant'
        content = str(turn.get('content', ''))[:500]
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _ask_ai(message, history=None):
    client = _get_gemini_client()
    if not client:
        return None

    prompt = SYSTEM_INSTRUCTION.format(context=_build_context())
    convo = _format_history(history)
    if convo:
        prompt += f"\n\nCONVERSATION SO FAR:\n{convo}"
    prompt += f"\n\nVisitor question: {message}\nAssistant:"

    try:
        response = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
        reply = (response.text or "").strip()
        return {"message": reply} if reply else None
    except Exception as e:
        print("GEMINI ERROR:", type(e).__name__, repr(e))
        traceback.print_exc()
        return None


def _has(text, *words):
    return any(re.search(r'\b' + re.escape(w), text) for w in words)


def _rule_based(message):
    text = message.lower()

    # "which projects use X"
    matched_tech = next((t for t in knowledge.get_all_technologies()
                         if re.search(r'(?<![a-z0-9])' + re.escape(t.lower()) + r'(?![a-z0-9])', text)), None)
    if matched_tech and _has(text, 'project', 'use', 'using', 'built', 'made'):
        matches = [p for p in knowledge.get_projects() if matched_tech in p['technologies']]
        n = len(matches)
        names = ', '.join(p['name'] for p in matches)
        return {
            'message': f"{n} project{'s' if n != 1 else ''} use{'' if n != 1 else 's'} {matched_tech}: {names}.",
            'projects': [p['id'] for p in matches],
            'action': 'filter_projects',
            'technology': matched_tech,
        }

    if _has(text, 'project', 'built', 'portfolio work', 'work you'):
        projects = knowledge.get_projects()
        return {
            'message': f"Ayushman has {len(projects)} projects: " + ', '.join(p['name'] for p in projects) + ".",
            'projects': [p['id'] for p in projects],
            'action': 'show_projects',
        }

    if _has(text, 'skill', 'technolog', 'tech stack', 'stack'):
        cats = '; '.join(f"{s['category']} ({', '.join(s['skills'])})" for s in knowledge.get_skills())
        return {'message': f"Skills — {cats}.", 'action': 'show_skills'}

    if _has(text, 'certificate', 'certification', 'certified'):
        certs = knowledge.get_certificates()
        return {
            'message': f"Ayushman has {len(certs)} certificates: " + ', '.join(c['name'] for c in certs) + ".",
            'action': 'show_certificates',
        }

    if _has(text, 'education', 'college', 'degree', 'study', 'university', 'gniot'):
        e = knowledge.get_education()[0]
        return {'message': f"{e['degree']} at {e['institution']} — {e['status']}."}

    if _has(text, 'contact', 'email', 'reach', 'hire', 'linkedin', 'github'):
        p = knowledge.get_profile()
        return {
            'message': f"You can email Ayushman at {p['email']}, connect on LinkedIn ({p['linkedin']}) or see his code on GitHub ({p['github']}).",
            'action': 'show_contact',
        }

    if _has(text, 'about', 'who is', 'who are', 'bio', 'introduce', 'yourself'):
        p = knowledge.get_profile()
        return {'message': p['bio'], 'action': 'show_about'}

    if _has(text, 'status', 'available', 'internship', 'open to work', 'looking for'):
        return {'message': knowledge.get_profile()['status'] + ".", 'action': 'show_contact'}

    return None


def generate_response(message, history=None):
    result = _rule_based(message)
    if result:
        return result

    ai_result = _ask_ai(message, history)
    if ai_result:
        return ai_result

    return {
        'message': "I couldn't find that in the portfolio. Try asking about projects, skills, certificates, education or contact details.",
    }