"""Смоук-тест песочницы: запуск `python tools/smoke_sandbox.py` из корня webpath."""
import sys

sys.path.insert(0, "runner")
from sandbox import run_tests, run_plain  # noqa: E402

# (название, код, тесты, ожидаемый ok)
CASES = [
    ("верное решение", "def square(x):\n    return x*x\n",
     [{"kind": "call", "name": "square", "args": [5], "expected": 25},
      {"kind": "call", "name": "square", "args": [-3], "expected": 9}], True),
    ("неверное решение", "def square(x):\n    return x+1\n",
     [{"kind": "call", "name": "square", "args": [5], "expected": 25}], False),
    ("пустышка из starter", "def square(x):\n    pass\n",
     [{"kind": "call", "name": "square", "args": [5], "expected": 25}], False),
    ("проверка stdout", "print(2+3)", [{"kind": "stdout", "expected": "5"}], True),
    ("кириллица в stdout", "print('Привет, мир!')",
     [{"kind": "stdout", "expected": "Привет, мир!"}], True),
    ("raises", "def f(x):\n    return 10//x\n",
     [{"kind": "raises", "name": "f", "args": [0], "exception": "ZeroDivisionError"}], True),
    ("бесконечный цикл ловится таймаутом", "while True:\n    pass", [], False),
    ("запрещённый импорт os", "import os\nos.system('dir')", [], False),
    ("dunder-побег", "x = ().__class__.__bases__[0]", [], False),
    ("open() недоступен", "open('x.txt')", [], False),
    ("ООП с super().__init__", "class A:\n    def __init__(self, n):\n        self.n = n\n"
                               "class B(A):\n    def __init__(self, n):\n        super().__init__(n+1)\n"
                               "b = B(1)\nprint(b.n)", [{"kind": "stdout", "expected": "2"}], True),
    ("float с допуском", "def f():\n    return 1/3\n",
     [{"kind": "call", "name": "f", "args": [], "expected": 0.3333333333333333}], True),
    ("список как ответ", "def f(n):\n    return [i*i for i in range(n)]\n",
     [{"kind": "call", "name": "f", "args": [3], "expected": [0, 1, 4]}], True),
    ("разрешённый импорт math", "import math\ndef f(r):\n    return round(math.pi*r*r, 2)\n",
     [{"kind": "call", "name": "f", "args": [1], "expected": 3.14}], True),
    ("ошибка времени выполнения", "def f():\n    return undefined_name\n",
     [{"kind": "call", "name": "f", "args": [], "expected": 1}], False),
    ("defined + equals", "PI = 3.14\n",
     [{"kind": "defined", "name": "PI"}, {"kind": "equals", "name": "PI", "expected": 3.14}], True),
    ("дело в синтаксисе", "def f(\n", [], False),
]

bad = 0
for name, code, tests, expect_ok in CASES:
    out = run_tests(code, tests)
    good = out["ok"] == expect_ok
    bad += not good
    print(f"[{'PASS' if good else 'WRONG'}] {name} | ok={out['ok']} (ждали {expect_ok})")
    if not good or out.get("error"):
        print(f"        error={out.get('error')!r}")
    for r in out.get("results", []):
        print(f"        {'+' if r['passed'] else '-'} {r['label']} | {r['got']}")

print("\n--- run_plain ---")
plain = run_plain("for i in range(3):\n    print('строка', i)")
print(f"ok={plain['ok']} stdout={plain['stdout']!r}")
print(run_plain("import socket")["error"])

sys.exit(1 if bad or not plain["ok"] else 0)
