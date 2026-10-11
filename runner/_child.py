"""Дочерний процесс песочницы: исполняет код ученика и прогоняет проверки.

Запускается из sandbox.py, получает JSON в stdin, печатает JSON после маркера.
Отдельный процесс нужен, чтобы бесконечный цикл или падение не уронили Flask.
"""
from __future__ import annotations

import builtins as _builtins
import io
import json
import sys
import traceback
from contextlib import redirect_stdout, redirect_stderr

from sandbox import SAFE_MODULES, _close, _fmt, validate

OUTPUT_LIMIT = 100_000
_real_import = __import__


class OutputOverflow(Exception):
    pass


class CappedStream(io.StringIO):
    def write(self, s):
        if self.tell() + len(s) > OUTPUT_LIMIT:
            raise OutputOverflow("слишком много вывода — вероятно, цикл печатает без остановки")
        return super().write(s)


def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
    # AST-проверка уже пропустила этот импорт, но builtins урезаны, поэтому
    # штатный __import__ здесь отсутствует — подставляем свой с тем же белым списком.
    if name.split(".")[0] not in SAFE_MODULES:
        raise ImportError(f"модуль {name!r} недоступен в упражнениях")
    return _real_import(name, globals, locals, fromlist, level)


def make_globals(allowed):
    safe = {name: getattr(_builtins, name) for name in allowed if hasattr(_builtins, name)}
    safe["__name__"] = "__student__"
    safe["__import__"] = guarded_import
    safe["__builtins__"] = safe
    return safe


def run(payload):
    code = payload["code"]
    tests = payload.get("tests") or []
    allowed = payload.get("builtins") or []

    validate(code)

    namespace = make_globals(allowed)
    out = CappedStream()
    runtime_error = None
    try:
        program = compile(code, "<упражнение>", "exec")
    except SyntaxError as exc:
        return {"ok": False, "error": f"синтаксическая ошибка, строка {exc.lineno}: {exc.msg}",
                "results": [], "stdout": ""}

    with redirect_stdout(out), redirect_stderr(out):
        try:
            exec(program, namespace)
        except OutputOverflow as exc:
            return {"ok": False, "error": str(exc), "results": [], "stdout": out.getvalue()}
        except SystemExit:
            return {"ok": False, "error": "код вызвал exit()/sys.exit() — в упражнениях это не нужно",
                    "results": [], "stdout": out.getvalue()}
        except BaseException:
            runtime_error = format_student_error()

    stdout = out.getvalue()
    if runtime_error:
        return {"ok": False, "error": runtime_error, "results": [], "stdout": stdout}

    results = [run_test(t, namespace, stdout) for t in tests]
    return {"ok": all(r["passed"] for r in results), "results": results,
            "stdout": stdout, "error": None}


def format_student_error():
    tb = traceback.extract_tb(sys.exc_info()[2])
    frames = [f for f in tb if f.filename == "<упражнение>"]
    exc = sys.exc_info()[1]
    name = type(exc).__name__
    where = f" (строка {frames[-1].lineno})" if frames else ""
    return f"{name}{where}: {exc}"


def normalize(text):
    lines = [line.rstrip() for line in text.splitlines()]
    while lines and not lines[-1]:
        lines.pop()
    return lines


def run_test(test, namespace, stdout):
    kind = test.get("kind")
    label = test.get("label")

    if kind == "stdout":
        got, want = normalize(stdout), normalize(str(test.get("expected", "")))
        return result(label or f"вывод программы {got!r}", got == want,
                      f"ожидался вывод {want!r}", f"получен вывод {got!r}")

    if kind == "call":
        name = test["name"]
        args = test.get("args", [])
        kwargs = test.get("kwargs", {})
        label = label or f"{name}({', '.join(_fmt(a) for a in args)})"
        if name not in namespace or not callable(namespace[name]):
            return result(label, False, f"нужно определить функцию {name}", f"{name} не найдена")
        try:
            got = namespace[name](*args, **kwargs)
        except Exception as exc:
            return result(label, False, f"{test.get('expected')!r}", f"вызов упал: {type(exc).__name__}: {exc}")
        want = test.get("expected")
        return result(label, _close(got, want), f"ожидалось {_fmt(want)}", f"вернулось {_fmt(got)}")

    if kind == "raises":
        name = test["name"]
        args = test.get("args", [])
        wanted_exc = test.get("exception", "Exception")
        label = label or f"{name}(...) бросает {wanted_exc}"
        if name not in namespace or not callable(namespace[name]):
            return result(label, False, f"нужно определить функцию {name}", f"{name} не найдена")
        try:
            namespace[name](*args)
        except Exception as exc:
            return result(label, type(exc).__name__ == wanted_exc, wanted_exc, type(exc).__name__)
        return result(label, False, wanted_exc, "исключения не было")

    if kind == "defined":
        name = test["name"]
        label = label or f"определено имя {name}"
        found = name in namespace
        return result(label, found, f"{name} должна существовать", "на месте" if found else f"{name} не найдена")

    if kind == "equals":
        name = test["name"]
        want = test.get("expected")
        label = label or f"{name} == {_fmt(want)}"
        got = namespace.get(name, "<нет такого имени>")
        return result(label, _close(got, want), f"ожидалось {_fmt(want)}", f"значение {_fmt(got)}")

    return result(f"неизвестная проверка {kind!r}", False, "", "")


def result(label, passed, expected, got):
    return {"label": label, "passed": bool(passed), "expected": expected, "got": got}


def main():
    payload = json.loads(sys.stdin.read())
    try:
        answer = run(payload)
    except OutputOverflow as exc:
        answer = {"ok": False, "error": str(exc), "results": [], "stdout": ""}
    except Exception as exc:
        answer = {"ok": False, "error": f"песочница: {type(exc).__name__}: {exc}", "results": [], "stdout": ""}
    sys.stdout.write("\n<<<RESULT>>>" + json.dumps(answer, ensure_ascii=False))


if __name__ == "__main__":
    main()
