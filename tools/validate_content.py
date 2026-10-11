"""Валидация контента курса: схема, ссылки, и проверяемость эталонных решений.

Запуск из корня webpath:
    python tools/validate_content.py            # схема + решения
    python tools/validate_content.py --quick    # только схема, без песочницы
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "runner"))
sys.path.insert(0, str(ROOT))

CONTENT = ROOT / "content"
LESSONS = CONTENT / "lessons"

LANGS = {"html", "css", "js", "javascript", "python", "py", "bash", "shell", "json", "text", "sql", "yaml"}
DIFFICULTY = {"beginner", "intermediate", "advanced"}
PY_TEST_KINDS = {"call", "stdout", "raises", "defined", "equals"}
DOM_CHECK_KINDS = {"dom", "text", "css", "js", "contains", "attr"}
REQUIRED_LESSON = ("id", "stage", "module", "order", "title", "body", "exercises")

REQUIRED_GAME = ("id", "title", "tagline", "icon", "gradient", "kind", "seconds", "questions")
GAME_KINDS = {"selector", "bug", "flex"}
BUG_LANGS = {"html", "css", "js", "python"}
# Значения flex-свойств, которые движок умеет показывать в предпросмотре.
FLEX_DIRECTION = {"row", "column", "row-reverse", "column-reverse"}
FLEX_JUSTIFY = {"flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"}
FLEX_ALIGN = FLEX_JUSTIFY - {"space-between", "space-around", "space-evenly"} | {"stretch", "baseline"}

errors: list[str] = []
warnings: list[str] = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def read_json(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="не запускать песочницу")
    args = ap.parse_args()

    curriculum = read_json(CONTENT / "curriculum.json")
    resources = read_json(CONTENT / "resources.json") if (CONTENT / "resources.json").exists() else {"items": [], "groups": []}

    stage_ids = [s["id"] for s in curriculum["stages"]]
    module_ids = {m["id"] for s in curriculum["stages"] for m in s["modules"]}
    resource_ids = {i["id"] for i in resources["items"]}

    # --- curriculum ---
    if len(stage_ids) != len(set(stage_ids)):
        err("curriculum: повторяющиеся id этапов")
    if len(module_ids) != sum(len(s["modules"]) for s in curriculum["stages"]):
        err("curriculum: повторяющиеся id модулей")

    planned = [lid for s in curriculum["stages"] for m in s["modules"] for lid in m["lessons"]]
    if len(planned) != len(set(planned)):
        dupes = [k for k, v in Counter(planned).items() if v > 1]
        err(f"curriculum: урок встречается в нескольких модулях: {dupes}")

    for stage in curriculum["stages"]:
        if not stage.get("gradient") or len(stage["gradient"]) != 2:
            err(f"curriculum: у этапа {stage['id']} нет пары цветов gradient")

    # --- resources ---
    group_ids = {g["id"] for g in resources.get("groups", [])}
    for item in resources.get("items", []):
        if item.get("group") not in group_ids:
            err(f"resources: {item.get('id')} ссылается на несуществующую группу {item.get('group')!r}")
        for st in item.get("track", []):
            if st not in stage_ids:
                err(f"resources: {item.get('id')} ссылается на несуществующий этап {st!r}")
        if not item.get("url", "").startswith("http"):
            err(f"resources: {item.get('id')} без корректного url")
        if item.get("free") not in resources.get("freeLabels", {}):
            err(f"resources: {item.get('id')} с непонятным статусом free={item.get('free')!r}")

    # --- уроки ---
    if not LESSONS.exists():
        warn(f"папки {LESSONS} нет — уроков 0 из {len(planned)}")
    files = sorted(LESSONS.glob("*.json")) if LESSONS.exists() else []
    found = {}
    for path in files:
        try:
            lesson = read_json(path)
        except json.JSONDecodeError as exc:
            err(f"{path.name}: битый JSON — {exc}")
            continue
        lid = lesson.get("id") or path.stem
        found[lid] = lesson
        if lid != path.stem:
            err(f"{path.name}: id {lid!r} не совпадает с именем файла")
        if not lesson.get("body"):
            md = path.with_suffix(".md")
            if md.exists():
                lesson["body"] = md.read_text(encoding="utf-8")
            else:
                err(f"{path.name}: нет ни поля body, ни файла {md.name}")
        check_lesson(lesson, stage_ids, module_ids, resource_ids, path.name)

    for lid in planned:
        if lid not in found:
            warn(f"нет файла урока {lid}")
    for lid in found:
        if lid not in planned:
            err(f"урок {lid} не заявлен в curriculum.json")

    # --- мини-игры ---
    n_games, n_questions = check_games()

    # --- проверяем эталонные решения песочницей ---
    checked = 0
    if not args.quick:
        from sandbox import run_tests
        for lid, lesson in found.items():
            for ex in lesson.get("exercises", []):
                if ex.get("type") != "code" or ex.get("lang") not in ("python", "py"):
                    continue
                solution, tests = ex.get("solution"), ex.get("tests") or []
                if not solution:
                    err(f"{lid}/{ex.get('id')}: у python-упражнения нет solution")
                    continue
                if not tests:
                    warn(f"{lid}/{ex.get('id')}: python-упражнение без тестов")
                    continue
                checked += 1
                res = run_tests(solution, tests)
                if not res.get("ok"):
                    failed = [r["label"] for r in res.get("results", []) if not r["passed"]]
                    err(f"{lid}/{ex['id']}: эталонное решение НЕ проходит тесты — "
                        f"{res.get('error') or failed}")

    missing = [lid for lid in planned if lid not in found]
    print(f"этапов: {len(stage_ids)} | модулей: {len(module_ids)} | уроков в плане: {len(planned)} "
          f"| написано: {len(found)} | ресурсов: {len(resources.get('items', []))}")
    if n_games:
        print(f"мини-игр: {n_games} | вопросов в их банках: {n_questions}")
    if checked:
        print(f"эталонных python-решений прогнано через песочницу: {checked}")
    for w in warnings:
        print(f"  WARN  {w}")
    for e in errors:
        print(f"  ERROR {e}")
    if missing and not warnings:
        print("  (все уроки на месте)")
    print(f"\nИТОГ: {len(errors)} ошибок, {len(warnings)} предупреждений"
          f"{' — ПРОЙДЕНО' if not errors else ' — НЕ ПРОЙДЕНО'}")
    return 1 if errors else 0


def check_lesson(lesson, stage_ids, module_ids, resource_ids, fname):
    lid = lesson.get("id", "?")
    tag = f"{fname} ({lid})"

    for field in REQUIRED_LESSON:
        if field not in lesson:
            err(f"{tag}: нет обязательного поля {field!r}")

    if lesson.get("stage") not in stage_ids:
        err(f"{tag}: неизвестный этап {lesson.get('stage')!r}")
    if lesson.get("module") not in module_ids:
        err(f"{tag}: неизвестный модуль {lesson.get('module')!r}")
    if lesson.get("difficulty") and lesson["difficulty"] not in DIFFICULTY:
        err(f"{tag}: difficulty={lesson['difficulty']!r}")

    body = lesson.get("body") or ""
    words = len(body.split())
    if words < 120:
        err(f"{tag}: теория слишком короткая ({words} слов), нужно 250–550")
    elif words > 900:
        warn(f"{tag}: теория длинновата ({words} слов)")
    for marker in ("TODO", "lorem", "текст будет", "заглушка"):
        if marker.lower() in body.lower():
            err(f"{tag}: в теории найдена заглушка {marker!r}")

    exercises = lesson.get("exercises") or []
    if len(exercises) < 2:
        err(f"{tag}: нужно минимум 2 упражнения, есть {len(exercises)}")
    if len(exercises) > 5:
        warn(f"{tag}: больше 5 упражнений — урок распухает")
    if not any(ex.get("type") in ("quiz", "code") for ex in exercises):
        err(f"{tag}: нет ни одного автоматически проверяемого упражнения")

    ids = [ex.get("id") for ex in exercises]
    if len(ids) != len(set(ids)):
        err(f"{tag}: повторяющиеся id упражнений")

    for ex in exercises:
        check_exercise(ex, tag, resource_ids)

    for rid in lesson.get("resources", []):
        if rid not in resource_ids:
            err(f"{tag}: ресурс {rid!r} отсутствует в resources.json")

    nxt = lesson.get("next")
    if nxt is not None and not isinstance(nxt, str):
        err(f"{tag}: next должен быть строкой или null")


def check_exercise(ex, tag, resource_ids):
    eid = ex.get("id", "?")
    kind = ex.get("type")

    if kind == "quiz":
        opts = ex.get("options") or []
        if len(opts) < 2:
            err(f"{tag}/{eid}: у quiz меньше двух вариантов")
        ans = ex.get("answer")
        if not isinstance(ans, int) or not (0 <= ans < len(opts)):
            err(f"{tag}/{eid}: answer={ans!r} вне диапазона вариантов")
        if not ex.get("explain"):
            warn(f"{tag}/{eid}: у quiz нет объяснения")

    elif kind == "code":
        lang = ex.get("lang")
        if lang not in LANGS:
            err(f"{tag}/{eid}: неизвестный lang={lang!r}")
        for field in ("prompt", "starter"):
            if not ex.get(field):
                err(f"{tag}/{eid}: нет поля {field!r}")
        if lang in ("python", "py"):
            for t in ex.get("tests") or []:
                if t.get("kind") not in PY_TEST_KINDS:
                    err(f"{tag}/{eid}: неизвестный kind теста {t.get('kind')!r}")
                if t.get("kind") in ("call", "raises", "defined", "equals") and not t.get("name"):
                    err(f"{tag}/{eid}: тесту kind={t.get('kind')} нужно имя name")
                if t.get("kind") in ("call", "stdout", "equals") and "expected" not in t:
                    err(f"{tag}/{eid}: тесту kind={t.get('kind')} нужно expected")
            if not ex.get("tests"):
                err(f"{tag}/{eid}: python-упражнение без tests не проверяется")
        else:
            for c in ex.get("checks") or []:
                if c.get("kind") not in DOM_CHECK_KINDS:
                    err(f"{tag}/{eid}: неизвестный kind проверки {c.get('kind')!r}")
                if c.get("kind") in ("dom", "text", "css", "contains", "attr") and not c.get("selector"):
                    err(f"{tag}/{eid}: проверке kind={c.get('kind')} нужен selector")
            if not ex.get("checks"):
                err(f"{tag}/{eid}: {lang}-упражнение без checks не проверяется")
            if lang == "css" and not ex.get("markup"):
                err(f"{tag}/{eid}: css-упражнению нужен markup — к чему применять стили")
        if not ex.get("solution"):
            warn(f"{tag}/{eid}: нет эталонного решения")

    elif kind == "task":
        if not ex.get("checklist"):
            err(f"{tag}/{eid}: task без checklist")

    else:
        err(f"{tag}/{eid}: неизвестный тип упражнения {kind!r}")


def sprite_icons() -> set:
    """Имена символов из спрайта в templates/index.html."""
    html = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
    return set(re.findall(r'<symbol id="i-([a-z0-9-]+)"', html))


def check_games():
    """Схема content/games.json.

    Здесь проверяется то, что видно без браузера: поля, диапазон ответа,
    отсутствие дублей среди вариантов, метка цели и корректность flex-троек.
    """
    path = CONTENT / "games.json"
    if not path.exists():
        warn("нет content/games.json — раздел мини-игр будет пустым")
        return 0, 0
    try:
        data = read_json(path)
    except json.JSONDecodeError as exc:
        err(f"games.json: битый JSON — {exc}")
        return 0, 0

    games = data.get("games") or []
    if not games:
        err("games.json: список games пуст")
        return 0, 0

    icons = sprite_icons()
    seen: set[str] = set()
    total = 0

    for game in games:
        gid = game.get("id", "?")
        tag = f"игра {gid}"
        for field in REQUIRED_GAME:
            if field not in game:
                err(f"{tag}: нет обязательного поля {field!r}")
        if gid in seen:
            err(f"{tag}: повторяющийся id игры")
        seen.add(gid)
        kind = game.get("kind")
        if kind not in GAME_KINDS:
            err(f"{tag}: неизвестный kind={kind!r}")
            continue
        if not game.get("title", "").strip() or not game.get("tagline", "").strip():
            err(f"{tag}: пустой title или tagline")
        if game.get("icon") not in icons:
            err(f"{tag}: иконка {game.get('icon')!r} отсутствует в спрайте index.html")
        gradient = game.get("gradient") or []
        if len(gradient) != 2 or not all(re.fullmatch(r"#[0-9a-fA-F]{6}", c or "") for c in gradient):
            err(f"{tag}: gradient — пара hex-цветов, получено {gradient!r}")
        seconds = game.get("seconds")
        if not isinstance(seconds, int) or not 30 <= seconds <= 300:
            err(f"{tag}: seconds={seconds!r}, нужно целое 30–300")
        questions = game.get("questions") or []
        if len(questions) < 8:
            err(f"{tag}: в банке {len(questions)} вопросов, минимум 8")
        total += len(questions)
        qids = [q.get("id") for q in questions]
        for dupe, c in Counter(qids).items():
            if c > 1:
                err(f"{tag}: вопрос {dupe!r} встречается в банке {c} раза")
        for q in questions:
            check_question(q, tag, kind)

    return len(games), total


def check_question(q, tag, kind):
    qid = q.get("id", "?")
    where = f"{tag}/{qid}"
    for field in ("id", "prompt", "options", "answer", "explain"):
        if field not in q:
            err(f"{where}: нет обязательного поля {field!r}")
            return

    if not q["prompt"].strip():
        err(f"{where}: пустой prompt")
    opts = q["options"]
    if len(opts) != 4:
        err(f"{where}: нужно ровно 4 варианта, есть {len(opts)}")
    answer = q["answer"]
    if not isinstance(answer, int) or not 0 <= answer < len(opts):
        err(f"{where}: answer={answer!r} вне диапазона вариантов")
        return

    texts = [o if isinstance(o, str) else json.dumps(o, ensure_ascii=False) for o in opts]
    dupes = [t for t, c in Counter(texts).items() if c > 1]
    if dupes:
        err(f"{where}: варианты-дубли {dupes} — ответ нельзя сделать однозначным")
    if len(q["explain"].strip()) < 30:
        warn(f"{where}: объяснение короче 30 символов")
    for marker in ("TODO", "текст будет", "заглушка"):
        if marker.lower() in " ".join(texts + [q["prompt"], q["explain"]]).lower():
            err(f"{where}: найдена заглушка {marker!r}")

    code = q.get("code") or []
    if kind == "selector":
        if q.get("lang") != "html":
            err(f"{where}: selector-вопросу нужен lang=html")
        if not code or not all(isinstance(line, str) for line in code):
            err(f"{where}: code должен быть непустым списком строк")
            return
        marked = "\n".join(code).count("data-target")
        if marked == 0:
            err(f"{where}: ни один элемент не помечен data-target — непонятно, что искать селектором")
        if q.get("styling") is not None and not isinstance(q["styling"], bool):
            err(f"{where}: поле styling бывает только true/false")
        for text in texts:
            if not text.strip() or text.lstrip().startswith("<"):
                err(f"{where}: вариант {text!r} не похож на CSS-селектор")

    elif kind == "bug":
        if q.get("lang") not in BUG_LANGS:
            err(f"{where}: lang={q.get('lang')!r}, допустимо {sorted(BUG_LANGS)}")
        if not code or not all(isinstance(line, str) and line.strip() for line in code):
            err(f"{where}: code должен быть непустым списком строк")

    elif kind == "flex":
        items = q.get("items")
        if not isinstance(items, int) or not 2 <= items <= 4:
            err(f"{where}: items={items!r}, нужно целое 2–4")
        target = q.get("target")
        for triple in [target] + list(opts):
            if not isinstance(triple, list) or len(triple) != 3:
                err(f"{where}: тройка {triple!r} — это список из 3 значений flex")
                continue
            direction, justify, align = triple
            if direction not in FLEX_DIRECTION or justify not in FLEX_JUSTIFY or align not in FLEX_ALIGN:
                err(f"{where}: недопустимые значения flex в тройке {list(triple)}")
        if not isinstance(target, list) or len(target) != 3:
            return
        if sum(1 for t in opts if t == target) != 1:
            err(f"{where}: цель должна встречаться среди вариантов ровно один раз")
        if len({json.dumps(t, ensure_ascii=False) for t in opts}) != len(opts):
            err(f"{where}: одинаковые тройки в вариантах — ответ неоднозначен")


if __name__ == "__main__":
    sys.exit(main())
