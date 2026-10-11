"""Точечная проверка уроков: схема + прогон solution через песочницу.

Быстрее полного validate_content.py, потому что смотрит только названные уроки.

    python tools/check_lessons.py css-06-grid db-02-select
    python tools/check_lessons.py --all
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "runner"))
sys.path.insert(0, str(ROOT))

import validate_content as vc  # noqa: E402
from sandbox import run_tests  # noqa: E402

LESSONS = ROOT / "content" / "lessons"


def check_solution(lid: str, lesson: dict) -> int:
    """Прогоняет каждое python-решение через настоящую песочницу."""
    ran = 0
    for ex in lesson.get("exercises", []):
        if ex.get("type") != "code" or ex.get("lang", "python") not in ("python", "py"):
            continue
        solution, tests = ex.get("solution"), ex.get("tests") or []
        if not solution:
            vc.err(f"{lid}/{ex.get('id')}: у python-упражнения нет solution")
            continue
        if not tests:
            vc.err(f"{lid}/{ex.get('id')}: у python-упражнения нет tests")
            continue
        ran += 1
        res = run_tests(solution, tests)
        if res.get("ok"):
            print(f"  ok    {lid}/{ex['id']} — эталон проходит {len(tests)} тест(ов)")
        else:
            failed = [r.get("label", "?") for r in res.get("results", []) if not r.get("passed")]
            vc.err(f"{lid}/{ex['id']}: эталон НЕ проходит тесты — {res.get('error') or failed}")
    return ran


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2

    curriculum = vc.read_json(ROOT / "content" / "curriculum.json")
    res_path = ROOT / "content" / "resources.json"
    resources = vc.read_json(res_path) if res_path.exists() else {"items": [], "groups": []}
    stage_ids = [s["id"] for s in curriculum["stages"]]
    module_ids = {m["id"] for s in curriculum["stages"] for m in s["modules"]}
    resource_ids = {i["id"] for i in resources["items"]}

    ids = sorted(p.stem for p in LESSONS.glob("*.json")) if args == ["--all"] else [
        a[:-5] if a.endswith(".json") else a for a in args
    ]

    ran = 0
    for lid in ids:
        path = LESSONS / f"{lid}.json"
        if not path.exists():
            vc.err(f"{lid}: нет файла {path.name}")
            continue
        try:
            lesson = vc.read_json(path)
        except json.JSONDecodeError as exc:
            vc.err(f"{lid}: битый JSON — {exc}")
            continue
        if lesson.get("id") != lid:
            vc.err(f"{path.name}: id {lesson.get('id')!r} не совпадает с именем файла")
        if not lesson.get("body"):
            md = path.with_suffix(".md")
            if md.exists():
                lesson["body"] = md.read_text(encoding="utf-8")
            else:
                vc.err(f"{path.name}: нет ни поля body, ни файла {md.name}")
        print(f"== {lid}")
        vc.check_lesson(lesson, stage_ids, module_ids, resource_ids, path.name)
        ran += check_solution(lid, lesson)

    print()
    for e in vc.errors:
        print(f"  ERROR {e}")
    verdict = "чисто" if not vc.errors else f"{len(vc.errors)} ошибок"
    print(f"\nУроков проверено: {len(ids)} | решений прогнано через песочницу: {ran} | {verdict}")
    return 1 if vc.errors else 0


if __name__ == "__main__":
    sys.exit(main())
