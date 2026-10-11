## Исключение — это сигнал, а не конец программы

Пока код счастлив, всё просто. Проблемы начинаются на границах: файл не найден, сеть отвалилась, пользователь ввёл «двадцать пять» вместо числа. Python сообщает о таких сбоях **исключениями** (exceptions) — объектами, которые «всплывают» вверх по стеку вызовов, пока их кто-то не поймает. Не поймал никто — программа падает с трейсбеком.

```python
def parse_age(text):
    return int(text)

parse_age("25")     # 25
parse_age("двадцать пять")   # ValueError: invalid literal for int()
```

## try / except / else / finally

```python
def divide(a, b):
    try:
        result = a / b
    except ZeroDivisionError:
        print("На ноль делить нельзя")
        return None
    else:
        return result          # выполнится, только если исключений не было
    finally:
        print("Расчёт завершён")   # выполнится всегда
```

- `try` — блок, где возможна ошибка.
- `except ZeroDivisionError` — ловим **конкретный** тип. Можно перечислить несколько `except` подряд, от узких к широким.
- `else` — код на случай, если всё прошло. Сюда стоит выносить то, что не должно попадать под перехват: ошибка в `else` не будет проглочена вашим же `except`.
- `finally` — выполняется всегда: и при успехе, и при исключении. Место для гарантированной уборки.

Объект исключения доступен через `as`: `except ValueError as exc` — в `exc` лежит само исключение, `exc.args`, а у `KeyError` — пропавший ключ.

## Иерархия: кого вы ловите на самом деле

Исключения образуют дерево: `ZeroDivisionError` — наследник `ArithmeticError`, тот — `Exception`, а выше стоит `BaseException`, куда входят также `KeyboardInterrupt` и `SystemExit`.

```python
except LookupError:        # поймает и KeyError, и IndexError
except (TypeError, ValueError):   # оба перечисленных типа
except Exception:          # вообще все «обычные» ошибки
except:                    # голый except — ещё и KeyboardInterrupt
```

Голый `except:` — грубая ошибка: он перехватывает всё, включая Ctrl+C, и вы не узнаете, что именно сломалось. Ловите максимально узкий тип, который умеете обработать.

```python
# плохо: под одну гребёнку
try:
    total = price * count
except:
    total = 0

# хорошо: известно, чего боимся
try:
    total = price * count
except TypeError:
    print(f"price={price!r}, count={count!r} — не числа")
    raise          # не умеем чинить — пробрасываем дальше
```

## raise и свои исключения

Исключения можно **бросать** самому через `raise` — и создавать собственные классы:

```python
class InsufficientFundsError(Exception):
    """Не хватает денег на счёте."""

def withdraw(balance, amount):
    if amount > balance:
        raise InsufficientFundsError(f"нужно {amount}, есть {balance}")
    return balance - amount
```

Наследуйтесь от `Exception` (или от доменного типа вроде `ValueError`), а имя класса заканчивайте на `Error`, если это ошибка. Свои исключения — это словарь языка вашего приложения: вызывающий код может поймать `InsufficientFundsError` и не ловить вообще всё подряд.

## EAFP против LBYL

Два стиля защитного кода:

- **LBYL** (Look Before You Leap) — «сначала проверь»: `if "name" in user: print(user["name"])`.
- **EAFP** (Easier to Ask Forgiveness than Permission) — «сначала сделай, потом разберись»: `try: user["name"] except KeyError: ...`.

В Python EAFP часто предпочтительнее: проверка и использование разделены во времени, и между `if key in d` и `d[key]` словарь может измениться. Плюс «счастливая» ветка остаётся без вложенных `if`. Но если промах — норма, а не редкость (валидация ввода пользователя), обычный `if` читается лучше, чем `try`.

## Две ловушки, которые стоит запомнить

**`return` внутри `finally` глотает исключение.** Такой код вернёт `{}` и спрячет любую ошибку:

```python
def load_config():
    try:
        raise ValueError("файл повреждён")
    finally:
        return {}      # return в finally перезаписывает и результат, и исключение
```

`finally` — только для уборки, без `return`, `break` и `continue`.

**Широкий `except Exception: pass` превращает баг в тишину.** Ошибка остаётся в коде, но перестает быть заметной. Поймали — значит либо обработали, либо залогили и пробросили через `raise`.
