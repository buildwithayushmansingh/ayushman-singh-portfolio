"""
Portfolio Knowledge Layer.

Loads the structured JSON files in data/ into memory once, and exposes
simple, typed getter functions. Phase 3 (the Flask API route) and Phase 4
(the AI integration) will both read the portfolio through this module —
nothing else should touch the JSON files directly.
"""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')


def _load(filename):
    path = os.path.join(DATA_DIR, filename)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


# loaded once at import time — this data doesn't change while the app runs
_profile = _load('profile.json')
_education = _load('education.json')
_skills = _load('skills.json')
_projects = _load('projects.json')
_certificates = _load('certificates.json')


def get_profile():
    return _profile


def get_education():
    return _education


def get_skills():
    return _skills


def get_projects():
    return _projects


def get_project_by_id(project_id):
    return next((p for p in _projects if p['id'] == project_id), None)


def get_certificates():
    return _certificates


def get_all_technologies():
    """Every distinct technology mentioned across all projects — useful
    later for validating/matching a visitor's 'which projects use X' query."""
    techs = set()
    for p in _projects:
        techs.update(p.get('technologies', []))
    return sorted(techs)