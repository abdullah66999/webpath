## Наследование: класс на базе класса

Один класс может **наследовать** (inherit) другой: взять его атрибуты и методы и добавить или переопределить своё.

```python
class Employee:
    def __init__(self, name, salary):
        self.name = name
        self.salary = salary

    def info(self):
        return f"{self.name}: {self.salary}"

class Manager(Employee):          # Manager наследует Employee
    def __init__(self, name, salary, team_size):
        super().__init__(name, salary)
        self.team_size = team_size

    def info(self):               # переопределяем метод родителя
        base = super().info()
        return f"{base}, в подчинении {self.team_size}"

boss = Manager("Ирина", 300000, 7)
print(boss.info())                # Ирина: 300000, в подчинении 7
print(isinstance(boss, Employee)) # True — менеджер тоже сотрудник
```

`super()` — обращение к родителю. `super().__init__(name, salary)` запускает родительскую инициализацию: без неё у `Manager` просто не появились бы `name` и `salary`. То же работает и для методов: `super().info()` берёт родительскую версию, к которой можно что-то добавить.

Типичная ошибка — написать свой `__init__` в наследнике и забыть `super().__init__()`: атрибуты родителя не создадутся, и первый же `self.name` упадёт с `AttributeError`.

## MRO: в каком порядке ищется метод

При наследовании Python ищет атрибут по цепочке **MRO** (Method Resolution Order): сам класс → родители слева направо по правилам линеаризации → `object`.

```python
class A:
    def who(self): return "A"

class B(A):
    def who(self): return "B"

class C(A):
    def who(self): return "C"

class D(B, C):
    pass

print(D().who())   # B: поиск идёт D → B → C → A
```

Для одного родителя всё тривиально: метод ищется в ребёнке, потом в родителе. Ромбовидные схемы (D от B и C) встречаются редко, но именно MRO определяет, чей метод победит, и `super()` всегда идёт по этой цепочке, а не «строго в родителя».

## Магические методы

Методы с двумя подчёркиваниями по краям (dunder-методы, от double underscore) Python вызывает сам в ответ на синтаксис. Вы уже знаете `__init__`. Вот ещё четыре, которые превращают ваш класс в «удобный»:

| метод | когда вызывается |
| --- | --- |
| `__str__` | `print(obj)`, `str(obj)` — текст для человека |
| `__repr__` | вывод в консоли, внутри списков и словарей — текст для программиста |
| `__eq__` | сравнение `obj1 == obj2` |
| `__len__` | `len(obj)` |

```python
class Money:
    def __init__(self, amount, currency="RUB"):
        self.amount = amount
        self.currency = currency

    def __str__(self):
        return f"{self.amount} {self.currency}"

    def __repr__(self):
        return f"Money({self.amount!r}, {self.currency!r})"

price = Money(1200)
print(price)        # 1200 RUB          — сработал __str__
print([price])      # [Money(1200, 'RUB')] — список печатает repr элементов
```

**Путаница `__str__` и `__repr__`** — классика. `__str__` — красивая строка для пользователя. `__repr__` — однозначное представление для разработчика, в идеале такой текст, по которому объект можно воссоздать: `Money(1200, 'RUB')`. Если определить только один — определяйте `__repr__`: при отсутствии `__str__` Python использует его. Без обоих `print` напечатает `<__main__.Money object at 0x7f...>`.

`__eq__` по умолчанию сравнивает объекты по идентичности (это тот же самый объект?). Своё равенство задаётся так:

```python
class Playlist:
    def __init__(self, title, tracks):
        self.title = title
        self.tracks = list(tracks)

    def __len__(self):
        return len(self.tracks)

    def __eq__(self, other):
        if not isinstance(other, Playlist):
            return NotImplemented
        return self.title == other.title and self.tracks == other.tracks

morning = Playlist("Утро", ["Yesterday"])
print(len(morning))                        # 1
print(morning == Playlist("Утро", ["Yesterday"]))   # True — содержимое совпало
```

Два нюанса. `return NotImplemented` (не путать с исключением `NotImplementedError`) — вежливый отказ: Python попробует сравнить с другой стороны. И побочный эффект: определив `__eq__` без `__hash__`, вы теряете возможность класть объекты в `set` и в ключи `dict` — Python считает их хеш неизвестным.

## Частые ошибки

- Забыли `super().__init__()` в наследнике — атрибуты родителя не созданы.
- Определили `__str__` и ждёте красивый вывод у `print([obj])` — списки используют `__repr__`.
- В `__eq__` написали `raise NotImplementedError` вместо `return NotImplemented` — сравнение с чужим типом упадёт вместо честного `False`.
- `len(obj)` требует, чтобы `__len__` возвращал целое неотрицательное число: строка или `None` приведут к `TypeError`.
