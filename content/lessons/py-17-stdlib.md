## Стандартная библиотека: что в ней есть полезного

Со стандартной библиотекой (standard library, «батарейки в комплекте») Python ставится сразу много готовых модулей — устанавливать ничего не нужно. Вот шесть, которые пригодятся в первом же проекте.

## collections: счётчики и словари с запасом

`Counter` считает хешируемые элементы и не падает на отсутствующем ключе:

```python
from collections import Counter

letters = Counter("молоко")
print(letters.most_common(2))   # [('о', 3), ('м', 1)]
print(letters["ы"])             # 0 — вместо KeyError
```

`defaultdict` сам создаёт значение для нового ключа:

```python
from collections import defaultdict

groups = defaultdict(list)
for name in ["анна", "алекс", "борис"]:
    groups[name[0]].append(name)
# {'а': ['анна', 'алекс'], 'б': ['борис']} — без проверок «есть ли ключ»
```

Аргумент — фабрика значений: `list` для списков, `int` для счётчиков, `set` для множеств.

## itertools: конструктор последовательностей

`itertools` создаёт **ленивые** итераторы (lazy iterators): значения выдаются по одному, списки в памяти не строятся.

```python
from itertools import product, chain, combinations

list(product(["чёрный", "белый"], ["S", "M"]))
# [('чёрный','S'), ('чёрный','M'), ('белый','S'), ('белый','M')] — все комбинации

list(chain([1, 2], (3, 4)))         # [1, 2, 3, 4] — склеить последовательности
list(combinations("ABC", 2))        # [('A','B'), ('A','C'), ('B','C')]
```

Замена двум вложенным циклам «для каждого цвета каждый размер» — одна строка `product`.

## datetime: даты и время

```python
from datetime import date, datetime, timedelta

release = date(2024, 3, 15)
print(release + timedelta(days=30))          # 2024-04-14
print((date(2024, 12, 31) - release).days)   # 291

event = datetime.fromisoformat("2024-03-15T18:30:00")
print(event.strftime("%d.%m.%Y %H:%M"))      # 15.03.2024 18:30
```

Разность двух дат — `timedelta`, у него есть `.days` и `.seconds`. Строку в дату превращают `fromisoformat` или `strptime`, дату в строку — `strftime`.

Ловушка: `datetime.now()` возвращает **наивное** (naive) время — без часового пояса. Наивные и «осведомлённые» (aware, с `tzinfo`) моменты нельзя ни сравнивать, ни вычитать: будет `TypeError`. Храните и передавайте время в UTC и в ISO-формате (`2024-03-15T18:30:00+00:00`), а пользователю конвертируйте в его пояс уже на выводе.

## re: регулярные выражения

Модуль `re` ищет в тексте подстроки по шаблону (regular expression):

```python
import re

text = "Заказ №42 от 15.03.2024"
print(re.findall(r"\d+", text))     # ['42', '15', '03', '2024']

match = re.search(r"№(\d+)", text)
print(match.group(1))               # 42 — содержимое первой скобочной группы

print(re.sub(r"\s+", " ", "а   б\nв"))   # 'а б в'
```

`findall` возвращает все совпадения, `search` — первое (или `None`), `sub` — заменяет. Шаблоны пишите в «сырых» строках `r"..."`: тогда `\d` и `\s` не конфликтуют с экранированием Python. Перед использованием `match.group()` проверяйте `if match:` — несовпадение даёт `None`, и обращение к группе упадёт с `AttributeError`.

## json и pathlib — вы их уже знаете

`json.dumps`/`json.loads` (строки) и `json.dump`/`json.load` (файлы) разбирались в уроке про файлы, `pathlib.Path` — там же. Важно, что дата в JSON не сериализуется: `json.dumps({"day": date.today()})` упадёт с `TypeError`. Лечится превращением в строку заранее — `.isoformat()` — или параметром `default=str`.

## Частые ошибки

- `Counter(text)` считает **символы**, а `Counter(words)` — слова: на вход нужно подавать именно то, что хотите посчитать.
- Забыли `list(...)` вокруг результата `itertools` и напечатали объект-итератор вместо данных.
- Сравнили наивный `datetime.now()` с aware-датой из API — `TypeError`.
- Шаблон `re` написан без `r"..."`, и `"\d"` превратился в мусор ещё до того, как попал в `re`.
