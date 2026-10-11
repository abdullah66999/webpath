"""«Путь веб-разработчика» — локальная обучающая платформа.

Flask отдаёт одностраничный фронтенд, контент курса и API прогресса.
Всё работает офлайн: ни одного внешнего запроса, зависимости — только Flask.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, render_template, request, abort

from runner.sandbox import run_plain, run_tests

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
LESSONS_DIR = CONTENT / "lessons"
DB_PATH = ROOT / "data" / "progress.db"

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["JSON_AS_ASCII"] = False
app.json.ensure_ascii = False

_lock = threading.Lock()


# --------------------------------------------------------------------------- #
# Контент
# --------------------------------------------------------------------------- #
def _read_json(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def load_curriculum():
    return _read_json(CONTENT / "curriculum.json")


def load_resources():
    path = CONTENT / "resources.json"
    return _read_json(path) if path.exists() else {"groups": [], "items": []}


def load_games():
    path = CONTENT / "games.json"
    return _read_json(path) if path.exists() else {"games": []}


def load_lessons():
    """Индексирует все уроки. Теория берётся из поля body или из соседнего .md-файла."""
    lessons = {}
    if not LESSONS_DIR.exists():
        return lessons
    for path in sorted(LESSONS_DIR.glob("*.json")):
        try:
            data = _read_json(path)
        except (json.JSONDecodeError, OSError) as exc:
            print(f"[webpath] не читается {path.name}: {exc}")
            continue
        if not data.get("body"):
            md = path.with_suffix(".md")
            if md.exists():
                data["body"] = md.read_text(encoding="utf-8")
        lessons[data.get("id") or path.stem] = data
    return lessons


def lesson_meta(lesson):
    exercises = lesson.get("exercises") or []
    return {
        "id": lesson["id"],
        "title": lesson.get("title", lesson["id"]),
        "subtitle": lesson.get("subtitle", ""),
        "duration": lesson.get("duration", 10),
        "difficulty": lesson.get("difficulty", "beginner"),
        "exerciseIds": [ex.get("id") for ex in exercises if ex.get("id")],
        "exercises": len(exercises),
        "autoChecked": sum(1 for ex in exercises if ex.get("type") in ("quiz", "code")),
    }


# --------------------------------------------------------------------------- #
# База прогресса
# --------------------------------------------------------------------------- #
def db():
    if "db" not in g:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS lesson_progress (
            lesson_id  TEXT PRIMARY KEY,
            completed  INTEGER NOT NULL DEFAULT 0,
            last_seen  TEXT
        );
        CREATE TABLE IF NOT EXISTS exercise_progress (
            lesson_id   TEXT NOT NULL,
            exercise_id TEXT NOT NULL,
            solved      INTEGER NOT NULL DEFAULT 0,
            attempts    INTEGER NOT NULL DEFAULT 0,
            updated_at  TEXT,
            PRIMARY KEY (lesson_id, exercise_id)
        );
        CREATE TABLE IF NOT EXISTS game_records (
            game_id     TEXT PRIMARY KEY,
            best_score  INTEGER NOT NULL DEFAULT 0,
            best_streak INTEGER NOT NULL DEFAULT 0,
            plays       INTEGER NOT NULL DEFAULT 0,
            updated_at  TEXT
        );
        """
    )
    conn.commit()
    conn.close()


def read_progress():
    conn = db()
    lessons = {r["lesson_id"]: bool(r["completed"]) for r in conn.execute("SELECT * FROM lesson_progress")}
    exercises = {}
    for r in conn.execute("SELECT * FROM exercise_progress"):
        exercises.setdefault(r["lesson_id"], {})[r["exercise_id"]] = {
            "solved": bool(r["solved"]), "attempts": r["attempts"],
        }
    return {"lessons": lessons, "exercises": exercises}


def read_game_records():
    return {
        r["game_id"]: {"bestScore": r["best_score"], "bestStreak": r["best_streak"], "plays": r["plays"]}
        for r in db().execute("SELECT * FROM game_records")
    }


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# --------------------------------------------------------------------------- #
# Маршруты
# --------------------------------------------------------------------------- #
@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/bootstrap")
def api_bootstrap():
    curriculum = load_curriculum()
    lessons = load_lessons()
    progress = read_progress()

    stages = []
    total_lessons = available = 0
    for stage in curriculum["stages"]:
        modules = []
        for module in stage["modules"]:
            items = []
            for lesson_id in module["lessons"]:
                total_lessons += 1
                lesson = lessons.get(lesson_id)
                if lesson is None:
                    items.append({"id": lesson_id, "title": lesson_id, "available": False})
                    continue
                available += 1
                items.append({**lesson_meta(lesson), "available": True})
            modules.append({**{k: v for k, v in module.items() if k != "lessons"}, "lessons": items})
        stages.append({**{k: v for k, v in stage.items() if k != "modules"}, "modules": modules})

    return jsonify({
        "title": curriculum["title"],
        "tagline": curriculum["tagline"],
        "stages": stages,
        "progress": progress,
        "stats": {
            "lessonsTotal": total_lessons,
            "lessonsAvailable": available,
            "lessonsDone": sum(1 for v in progress["lessons"].values() if v),
            "exercisesDone": sum(
                1 for per in progress["exercises"].values() for ex in per.values() if ex["solved"]
            ),
            "minutesTotal": sum(l.get("duration", 10) for l in lessons.values()),
        },
    })


@app.get("/api/lesson/<lesson_id>")
def api_lesson(lesson_id):
    lessons = load_lessons()
    lesson = lessons.get(lesson_id)
    if lesson is None:
        abort(404, description=f"урок {lesson_id} ещё не написан")

    conn = db()
    conn.execute(
        "INSERT INTO lesson_progress (lesson_id, completed, last_seen) VALUES (?, 0, ?) "
        "ON CONFLICT(lesson_id) DO UPDATE SET last_seen = excluded.last_seen",
        (lesson_id, now_iso()),
    )
    conn.commit()

    solved = {
        r["exercise_id"]: bool(r["solved"])
        for r in conn.execute("SELECT exercise_id, solved FROM exercise_progress WHERE lesson_id = ?",
                              (lesson_id,))
    }
    resources = {i["id"]: i for i in load_resources().get("items", [])}
    linked = [resources[rid] for rid in lesson.get("resources", []) if rid in resources]

    return jsonify({**lesson, "solved": solved, "linkedResources": linked})


@app.get("/api/resources")
def api_resources():
    return jsonify(load_resources())


@app.get("/api/games")
def api_games():
    return jsonify({**load_games(), "records": read_game_records()})


@app.post("/api/progress/lesson")
def api_progress_lesson():
    payload = request.get_json(silent=True) or {}
    lesson_id = payload.get("lessonId")
    if not lesson_id:
        abort(400, description="нужен lessonId")
    completed = 1 if payload.get("completed", True) else 0
    with _lock:
        conn = db()
        conn.execute(
            "INSERT INTO lesson_progress (lesson_id, completed, last_seen) VALUES (?, ?, ?) "
            "ON CONFLICT(lesson_id) DO UPDATE SET completed = excluded.completed, last_seen = excluded.last_seen",
            (lesson_id, completed, now_iso()),
        )
        conn.commit()
    return jsonify({"ok": True, "lessonId": lesson_id, "completed": bool(completed)})


@app.post("/api/progress/exercise")
def api_progress_exercise():
    payload = request.get_json(silent=True) or {}
    lesson_id, exercise_id = payload.get("lessonId"), payload.get("exerciseId")
    if not lesson_id or not exercise_id:
        abort(400, description="нужны lessonId и exerciseId")
    solved = 1 if payload.get("solved") else 0
    with _lock:
        conn = db()
        conn.execute(
            "INSERT INTO exercise_progress (lesson_id, exercise_id, solved, attempts, updated_at) "
            "VALUES (?, ?, ?, 1, ?) "
            "ON CONFLICT(lesson_id, exercise_id) DO UPDATE SET "
            "solved = MAX(exercise_progress.solved, excluded.solved), "
            "attempts = exercise_progress.attempts + 1, updated_at = excluded.updated_at",
            (lesson_id, exercise_id, solved, now_iso()),
        )
        conn.commit()
        row = conn.execute(
            "SELECT solved FROM exercise_progress WHERE lesson_id = ? AND exercise_id = ?",
            (lesson_id, exercise_id),
        ).fetchone()
    # solved не откатывается назад (MAX в запросе выше), поэтому отвечаем тем,
    # что реально лежит в базе, а не тем, что прислал клиент.
    return jsonify({"ok": True, "solved": bool(row["solved"]) if row else bool(solved)})


@app.post("/api/progress/game")
def api_progress_game():
    payload = request.get_json(silent=True) or {}
    game_id = payload.get("gameId")
    if not game_id:
        abort(400, description="нужен gameId")
    known = {g["id"] for g in load_games().get("games", [])}
    if game_id not in known:
        abort(400, description=f"игры {game_id} не существует")

    def _int(name, limit):
        try:
            return max(0, min(int(payload.get(name, 0)), limit))
        except (TypeError, ValueError):
            return 0

    score = _int("score", 10_000_000)
    streak = _int("streak", 100_000)
    with _lock:
        conn = db()
        conn.execute(
            "INSERT INTO game_records (game_id, best_score, best_streak, plays, updated_at) "
            "VALUES (?, ?, ?, 1, ?) "
            "ON CONFLICT(game_id) DO UPDATE SET "
            "best_score = MAX(game_records.best_score, excluded.best_score), "
            "best_streak = MAX(game_records.best_streak, excluded.best_streak), "
            "plays = game_records.plays + 1, updated_at = excluded.updated_at",
            (game_id, score, streak, now_iso()),
        )
        conn.commit()
    return jsonify({"ok": True, "records": read_game_records()})


@app.post("/api/progress/reset")
def api_progress_reset():
    with _lock:
        conn = db()
        conn.execute("DELETE FROM lesson_progress")
        conn.execute("DELETE FROM exercise_progress")
        conn.execute("DELETE FROM game_records")
        conn.commit()
    return jsonify({"ok": True})


@app.post("/api/run")
def api_run():
    payload = request.get_json(silent=True) or {}
    return jsonify(run_plain(payload.get("code", "")))


@app.post("/api/check")
def api_check():
    payload = request.get_json(silent=True) or {}
    return jsonify(run_tests(payload.get("code", ""), payload.get("tests") or []))


@app.errorhandler(404)
def not_found(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": getattr(err, "description", "не найдено")}), 404
    return render_template("index.html")


@app.errorhandler(400)
def bad_request(err):
    return jsonify({"error": getattr(err, "description", "плохой запрос")}), 400


init_db()


def open_in_browser(url: str) -> None:
    """Открыть курс в браузере по умолчанию, не мусоря в консоль.

    ``webbrowser`` на Windows запускает ``cmd /c start`` с унаследованными
    потоками, и любой сбой ассоциации печатает «Системе не удается найти
    указанный путь» прямо в окно сервера. Поэтому глушим вывод дочернего
    процесса, а ``webbrowser`` оставляем запасным вариантом.
    """
    import subprocess
    import sys

    if sys.platform == "win32":
        try:
            subprocess.Popen(
                ["cmd", "/c", "start", "", url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
            )
            return
        except OSError:
            pass

    import webbrowser

    webbrowser.open(url)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Путь веб-разработчика — локальный сервер")
    parser.add_argument("--port", type=int, default=5050)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--open", action="store_true", help="открыть курс в браузере после старта")
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}/"
    print(f"\n  Путь веб-разработчика запущен:  {url}")
    print("  Остановить — Ctrl+C в этом окне.\n")

    if args.open:
        # Отложенно: иначе браузер откроется раньше, чем сервер примет первый запрос.
        threading.Timer(1.2, open_in_browser, args=(url,)).start()

    try:
        app.run(host=args.host, port=args.port, debug=False, threaded=True)
    except OSError as exc:
        # Двойной клик по start.bat — самая частая причина: порт уже занят
        # предыдущим окном, и без этого сообщения пользователь видит traceback.
        print(f"  Не удалось занять порт {args.port} ({exc}).")
        print(f"  Курс, скорее всего, уже открыт: {url}")
        print("  Если нет — закройте прошлое окно или запустите start.bat с другим портом:")
        print(f"      start.bat {args.port + 1}\n")
        raise SystemExit(1)
