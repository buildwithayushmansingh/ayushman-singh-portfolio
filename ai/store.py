"""Tiny SQLite store for AI chat logs + thumbs feedback (data/ai_chat.db, already gitignored)."""
import os
import sqlite3
import time

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'ai_chat.db')


def _conn():
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


def init():
    with _conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts REAL NOT NULL,
            question TEXT NOT NULL,
            answer TEXT,
            source TEXT,
            answered INTEGER DEFAULT 1,
            ms INTEGER DEFAULT 0,
            rating INTEGER DEFAULT 0
        )""")


def log_chat(question, answer, source, answered, ms):
    try:
        with _conn() as c:
            cur = c.execute(
                "INSERT INTO chats (ts, question, answer, source, answered, ms) VALUES (?,?,?,?,?,?)",
                (time.time(), question[:500], (answer or '')[:2000], source, 1 if answered else 0, int(ms)))
            return cur.lastrowid
    except Exception as e:
        print("ai_store.log_chat error:", repr(e))
        return None


def set_feedback(chat_id, rating):
    try:
        with _conn() as c:
            c.execute("UPDATE chats SET rating=? WHERE id=?", (rating, chat_id))
        return True
    except Exception as e:
        print("ai_store.set_feedback error:", repr(e))
        return False


def stats():
    with _conn() as c:
        total = c.execute("SELECT COUNT(*) FROM chats").fetchone()[0]
        by_source = {r[0]: r[1] for r in c.execute("SELECT source, COUNT(*) FROM chats GROUP BY source")}
        up = c.execute("SELECT COUNT(*) FROM chats WHERE rating=1").fetchone()[0]
        down = c.execute("SELECT COUNT(*) FROM chats WHERE rating=-1").fetchone()[0]
        top = [dict(r) for r in c.execute(
            "SELECT lower(question) AS question, COUNT(*) AS n FROM chats GROUP BY lower(question) ORDER BY n DESC LIMIT 10")]
        unanswered = [dict(r) for r in c.execute(
            "SELECT question, ts FROM chats WHERE answered=0 ORDER BY id DESC LIMIT 20")]
        bad = [dict(r) for r in c.execute(
            "SELECT question, answer FROM chats WHERE rating=-1 ORDER BY id DESC LIMIT 20")]
        avg_ms = c.execute("SELECT AVG(ms) FROM chats").fetchone()[0]
    return {'total': total, 'by_source': by_source, 'thumbs_up': up, 'thumbs_down': down,
            'avg_ms': round(avg_ms or 0), 'top_questions': top,
            'unanswered': unanswered, 'downvoted': bad}