"""
Portfolio AI Agent — Phase 3: rule-based responses over the knowledge layer.

This phase does NOT call an external AI API yet (that's Phase 4). It
answers a useful first set of questions directly from data/*.json so the
whole request -> response -> frontend pipeline is real and testable
before an external AI provider is wired in.
"""

import os
import json
from ai import knowledge
from ai.prompts import SYSTEM_INSTRUCTION

_gemini_model = None


def _get_gemini_model():
    """Lazily creates the Gemini client. Returns None (silently) if no
    API key is configured — the agent then just falls back to the
    rule-based answers from Phase 3, so the feature degrades gracefully
    instead of breaking when GEMINI_API_KEY isn't set."""
    global _gemini_model
    if _gemini_model is not None:
        return _gemini_model
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        return None
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    _gemini_model = genai.GenerativeModel('gemini-1.5-flash')
    return _gemini_model


def _build_context():
    """Everything the AI is allowed to know — nothing more."""
    return json.dumps({
        'profile': knowledge.get_profile(),
        'education': knowledge.get_education(),
        'skills': knowledge.get_skills(),
        'projects': knowledge.get_projects(),
        'certificates': knowledge.get_certificates(),
    }, indent=2)


def _ask_ai(message):
    model = _get_gemini_model()
    if not model:
        return None
    prompt = SYSTEM_INSTRUCTION.format(context=_build_context()) + f"\n\nVisitor question: {message}"
    try:
        response = model.generate_content(prompt)
        return {'message': response.text.strip()}
    except Exception:
        return None  # network/quota error — caller falls back gracefully


def generate_response(message):
    text = message.lower()

    # "which projects use X" for any real technology in the portfolio
    all_techs = knowledge.get_all_technologies()
    matched_tech = next((t for t in all_techs if t.lower() in text), None)
    if matched_tech and ('project' in text or 'use' in text or 'using' in text):
        matches = [p for p in knowledge.get_projects() if matched_tech in p['technologies']]
        if matches:
            names = ', '.join(p['name'] for p in matches)
            return {
                'message': f"I found {len(matches)} project{'s' if len(matches) != 1 else ''} using {matched_tech}: {names}.",
                'projects': [p['id'] for p in matches],
                'action': 'filter_projects',
                'technology': matched_tech,
            }
        return {'message': f"I don't have any projects using {matched_tech} yet.", 'projects': []}

    if 'project' in text:
        projects = knowledge.get_projects()
        names = ', '.join(p['name'] for p in projects)
        return {
            'message': f"Here are my {len(projects)} projects: {names}.",
            'projects': [p['id'] for p in projects],
            'action': 'show_projects',
        }

    if 'skill' in text or 'technolog' in text:
        skills = knowledge.get_skills()
        categories = ', '.join(s['category'] for s in skills)
        return {
            'message': f"My skills are grouped into: {categories}.",
            'action': 'show_skills',
        }

    if 'certificate' in text or 'certification' in text:
        certs = knowledge.get_certificates()
        names = ', '.join(c['name'] for c in certs)
        return {
            'message': f"I have {len(certs)} certificates: {names}.",
            'action': 'show_certificates',
        }

    if 'education' in text or 'college' in text or 'degree' in text or 'gniot' in text:
        edu = knowledge.get_education()[0]
        return {'message': f"{edu['degree']} at {edu['institution']} — {edu['status']}."}

    if 'about' in text or 'who are you' in text or 'bio' in text:
        profile = knowledge.get_profile()
        return {'message': profile['bio']}

    if 'contact' in text or 'email' in text or 'hire' in text:
        profile = knowledge.get_profile()
        return {'message': f"You can reach out at {profile['email']} or connect on LinkedIn: {profile['linkedin']}."}

    # nothing matched a known rule — let the real AI take a shot, still
    # grounded strictly in the portfolio data above
    ai_result = _ask_ai(message)
    if ai_result:
        return ai_result

    return {
        'message': "I couldn't find that information in my portfolio yet. Try asking about my projects, skills, certificates, or education.",
    }