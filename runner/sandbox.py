"""Безопасное выполнение кода ученика.

Два уровня защиты: статическая проверка AST до запуска и урезанный набор
builtins внутри subprocess с жёстким таймаутом. Это учебная песочница для
локального однопользовательского приложения, а не защита от враждебного кода.
"""
from __future__ import annotations

import ast
import json
import math
import os
import subprocess
import sys
from pathlib import Path

TIMEOUT_SECONDS = 5
MAX_OUTPUT_CHARS = 20_000

SAFE_MODULES = {
    "math", "random", "json", "re", "datetime", "itertools", "functools",
    "collections", "string", "textwrap", "statistics", "decimal", "fractions",
    "heapq", "bisect", "copy", "typing", "dataclasses", "enum", "abc",
    "calendar", "uuid", "hashlib", "base64", "unicodedata", "operator",
}

BANNED_NAMES = {
    "eval", "exec", "compile", "open", "__import__", "globals", "locals",
    "vars", "breakpoint", "exit", "quit", "input", "memoryview",
}

BANNED_ATTRS = {
    "__subclasses__", "__bases__", "__mro__", "__class__", "__globals__",
    "__builtins__", "__code__", "__closure__", "__func__", "__self__",
    "__module__", "__dict__", "__reduce__", "__import__", "__loader__",
    "__spec__", "__path__", "__file__",
}


class ValidationError(Exception):
    pass


def _check(node: ast.AST) -> None:
    for child in ast.walk(node):
        if isinstance(child, ast.Import):
            for alias in child.names:
                if alias.name.split(".")[0] not in SAFE_MODULES:
                    raise ValidationError(f"импорт модуля {alias.name!r} в упражнениях запрещён")
        elif isinstance(child, ast.ImportFrom):
            root = (child.module or "").split(".")[0]
            if root not in SAFE_MODULES:
                raise ValidationError(f"импорт модуля {root!r} в упражнениях запрещён")
        elif isinstance(child, ast.Global):
            raise ValidationError("global в упражнениях не нужен — оформите логику через функцию")
        elif isinstance(child, ast.Name) and child.id in BANNED_NAMES:
            raise ValidationError(f"{child.id}() в упражнениях недоступна")
        elif isinstance(child, ast.Attribute):
            if child.attr in BANNED_ATTRS:
                raise ValidationError(f"обращение к {child.attr!r} запрещено")


def validate(code: str) -> None:
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise ValidationError(f"синтаксическая ошибка в строке {exc.lineno}: {exc.msg}") from exc
    _check(tree)


def _close(actual, expected) -> bool:
    if isinstance(expected, bool) or isinstance(actual, bool):
        return actual is expected if isinstance(expected, bool) else actual == expected
    if isinstance(expected, float) or isinstance(actual, float):
        try:
            if isinstance(expected, float) and isinstance(actual, float):
                if math.isnan(expected) and math.isnan(actual):
                    return True
            return math.isclose(float(actual), float(expected), rel_tol=1e-6, abs_tol=1e-9)
        except (TypeError, ValueError):
            return False
    if isinstance(expected, (list, tuple)) and isinstance(actual, (list, tuple)):
        return len(expected) == len(actual) and all(_close(a, e) for a, e in zip(actual, expected))
    if isinstance(expected, dict) and isinstance(actual, dict):
        return set(expected) == set(actual) and all(_close(actual[k], expected[k]) for k in expected)
    return actual == expected


def _fmt(value) -> str:
    if value is None:
        return "None"
    return repr(value)


SAFE_BUILTINS = (
    "abs all any ascii bin bool bytearray bytes callable chr classmethod complex delattr dict divmod"
    " enumerate filter float format frozenset getattr hasattr hash hex id int isinstance issubclass"
    " iter len list map max min next object oct ord pow print property range repr reversed round"
    " set setattr slice sorted staticmethod str sum super tuple type vars zip"
    " ArithmeticError AssertionError AttributeError EOFError Exception FileNotFoundError"
    " IndexError KeyError LookupError NameError NotImplementedError OSError OverflowError"
    " RecursionError RuntimeError StopIteration SyntaxError TypeError ValueError ZeroDivisionError"
    " True False None Ellipsis NotImplemented __build_class__"
).split()


def run_tests(code: str, tests: list[dict]) -> dict:
    """Выполняет проверки. Возвращает {ok, results[], stdout, error}."""
    try:
        validate(code)
    except ValidationError as exc:
        return {"ok": False, "error": str(exc), "results": [], "stdout": ""}
    return _exec_payload({"code": code, "tests": tests, "builtins": SAFE_BUILTINS})


_RUNNER = Path(__file__).with_name("_child.py")


def _exec_payload(payload: dict) -> dict:
    # Без PYTHONUTF8 дочерний процесс в Windows печатает JSON в cp1251 и кириллица ломается.
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
    try:
        proc = subprocess.run(
            [sys.executable, str(_RUNNER)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=TIMEOUT_SECONDS,
            cwd=str(_RUNNER.parent),
            env=env,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"код выполнялся дольше {TIMEOUT_SECONDS} с — проверьте цикл на бесконечность",
                "results": [], "stdout": ""}

    raw = proc.stdout or ""
    marker = "<<<RESULT>>>"
    if marker in raw:
        head, _, tail = raw.partition(marker)
        try:
            result = json.loads(tail.strip())
        except json.JSONDecodeError:
            result = {"ok": False, "error": "не удалось разобрать ответ песочницы", "results": [], "stdout": head}
        result.setdefault("stdout", head.strip()[:MAX_OUTPUT_CHARS])
        return result

    err = (proc.stderr or "").strip().splitlines()
    short = err[-1] if err else "код упал без сообщения об ошибке"
    return {"ok": False, "error": short, "results": [], "stdout": raw.strip()[:MAX_OUTPUT_CHARS]}


def run_plain(code: str) -> dict:
    """Просто исполнить код и вернуть вывод — для кнопки «Запустить»."""
    try:
        validate(code)
    except ValidationError as exc:
        return {"ok": False, "error": str(exc), "stdout": ""}
    return _exec_payload({"code": code, "tests": [], "builtins": SAFE_BUILTINS})
