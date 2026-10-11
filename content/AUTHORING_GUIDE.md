# Как писать уроки (гайд для авторов)

Читается вместе с `content/SCHEMA.md`. Схема — это **что** писать, этот гайд —
**как** писать хорошо.

## Файлы

На каждый урок ровно два файла в `content/lessons/`:

```
<id>.json    — метаданные, примеры, упражнения
<id>.md      — теория
```

`id` берётся из `content/curriculum.json` и совпадает с именем файла. Поля
`stage`, `module`, `order` тоже из `curriculum.json` — не придумывайте свои.
`order` — номер урока внутри этапа (`css-05-flexbox` → `5`).

`next` — id следующего урока этапа. У последнего урока этапа `next` равен id
первого урока следующего этапа, у самого последнего урока курса (`pr-09-chto-dalshe`)
— `null`.

## Тон теории

- По-русски, на «вы». Прямые утверждения, без «в этом уроке мы рассмотрим»,
  без «как все знают», без «давайте приступим».
- 250–550 слов. Термин при первом упоминании — на русском и в скобках по-английски:
  «каскад (cascade)».
- Объяснение идёт через конкретный код, а не через абстракции. Сначала пример,
  потом почему он так работает.
- Один раздел = одна мысль. Заголовки `##` и `###`, не глубже.
- Обязательно блок о типичной ошибке. Ученик должен узнать свой будущий баг
  в тексте до того, как напишет его сам.
- Никаких «TODO», «текст будет позже», lorem ipsum, `...` вместо кода.

## Примеры (`examples`)

- 1–3 примера на урок. Каждый с осмысленным `title`.
- Код реальный и запускаемый: настоящие имена, никаких `foo`/`bar`/`x1`.
- `"runnable": true` только для `html`, `css`, `js` — их показывает живой预览вью.
  Для `python`, `bash`, `sql`, `json`, `text` — всегда `false`.
- Пример иллюстрирует ровно одно понятие. Если нужно показать два — два примера.

## Упражнения

2–4 штуки. Смесь: тест на понимание + код с автопроверкой + (где уместно)
практическое задание в реальном инструменте.

**Проверка обязана быть честной.** Три правила, из-за которых чаще всего
ломается курс:

1. `solution` должен проходить **все** свои `tests`/`checks`. Проверяется
   валидатором через настоящую песочницу.
2. Ни один неправильный вариант в `quiz` не может оказаться верным. Перечитайте
   все четыре варианта глазами зануды. Классическая ошибка — «неверный»
   `def f(a, b = 1)`, который на самом деле валидный Python.
3. `tests` должны ловить наивное неверное решение. Если задание «напишите
   функцию, возвращающую квадрат», а тест один (`square(5) == 25`), ученик
   сдаст `return 25`. Берите 2–4 теста с разными входами, включая граничные
   (ноль, отрицательное, пустая строка).

### Python-упражнения

Доступны только безопасные builtins. В `solution` нельзя использовать:
`open`, `eval`, `exec`, `compile`, `input`, `__import__`, `globals`, `locals`,
`vars` — а также импорт чего-либо кроме белого списка:
`math, random, json, re, datetime, itertools, functools, collections, string,
textwrap, statistics, decimal, fractions, heapq, bisect, copy, typing,
dataclasses, enum, abc, calendar, uuid, hashlib, base64, unicodedata, operator`.

Если урок про файлы или про `import requests` — упражнение делаете через `task`
(чек-лист) или через `quiz`, а не через `code`. Песочница не даст.

`kind: "stdout"` сравнивает вывод целиком построчно — в `solution` не должно
быть лишних `print`.

### HTML/CSS/JS-упражнения

- Для `lang: "css"` поле `markup` **обязательно**: это HTML, к которому ученик
  пишет стили. Селекторы в `checks` должны соответствовать `markup`.
- `fixture` подключается ДО стилей ученика. Кладите туда только нейтральное:
  сброс отступов, шрифт, тёмный фон превью. Не кладите туда то, что должен
  написать ученик.
- `prop` в `kind: "css"` — camelCase: `justifyContent`, `backgroundColor`,
  `fontSize`. Значение — ровно то, что вернёт `getComputedStyle`: цвета
  `rgb(18, 20, 34)`, длина `14px`, `display: flex` остаётся `flex`.
- Проверок должно хватать, чтобы нельзя было сдать пустой файл. `dom` с
  `count`, `text` с `contains`, `css` на ключевое свойство — минимум два вида.
- `kind: "js"` — выражение, возвращающее `true`/`false`.

### `task` — задание в реальном инструменте

Для того, что нельзя проверить кодом: создать репозиторий, настроить DevTools,
задеплоить, прогнать Lighthouse. Чек-лист 3–6 пунктов, каждый проверяемый
глазами («push прошёл без ошибок»), а не размытый («разобраться в теме»).

## Ресурсы

Поле `resources` — 2–4 id из `content/resources.json`. Только существующие id,
валидатор проверяет. Берите те, у которых в `track` есть ваш этап, плюс один
русскоязычный, если он есть для темы.

Полный список id: `res-cs50x, res-cs50w, res-cs50-edx, res-cs50w-harvardonline,
res-missing-semester, res-webdev-learn, res-google-developers, res-devtools,
res-grow-google, res-freecodecamp, res-odin, res-mdn-learn, res-jsinfo,
res-scrimba, res-codecademy, res-python-tutorial, res-python-tutorial-ru,
res-py4e, res-automate, res-w3schools-python, res-realpython, res-flask-tutorial,
res-flask-mega, res-django-tutorial, res-djangogirls-ru, res-fastapi,
res-mdn-http, res-api-design-ms, res-jwt, res-oauth2, res-sqlbolt, res-sql-ex,
res-postgres-tutorial, res-sqlite-docs, res-progit-en, res-progit-ru,
res-git-docs, res-learn-git-branching, res-younglinux, res-linuxjourney,
res-docker-start, res-render-free, res-railway, res-flyio, res-pythonanywhere,
res-vercel, res-netlify, res-supabase, res-oracle-free, res-hexlet,
res-htmlacademy, res-metanit, res-learn-javascript-ru, res-pythontutor-ru,
res-pythonworld, res-stepik-python-beginners, res-stepik-python-advanced,
res-stepik-python-pro, res-stepik-algorithms, res-stepik-catalog,
res-python-ru, res-learnpython-ru, res-dvmn, res-codewars, res-exercism,
res-checkio, res-leetcode, res-hackerrank`.

## `objectives`, `keypoints`, `duration`, `difficulty`

- `objectives` — 2–5 пунктов, каждый начинается с глагола в инфинитиве:
  «Объяснить…», «Написать…», «Отличить…». Это то, что ученик **сможет**,
  а не то, о чём урок.
- `keypoints` — 3–6 коротких выводов, которые читаются как шпаргалка перед сном.
- `duration` — честная оценка в минутах: теория + примеры + упражнения.
  Обычно 10–25.
- `difficulty` — `beginner` (этапы start/html/css/js/python),
  `intermediate` (fe-practice/backend/databases), `advanced` (django/production).

## Самопроверка перед сдачей

```bash
cd "C:/Users/Fozzi/Desktop/work/webpath"
PYTHONIOENCODING=utf-8 PYTHONUTF8=1 \
  "C:/Users/Fozzi/AppData/Local/Python/pythoncore-3.14-64/python.exe" \
  tools/validate_content.py
```

Он прогонит каждое `solution` через настоящую песочницу. Сдавать можно только
при `0 ошибок`. Предупреждения о чужих ненаписанных уроках игнорируйте —
смотрите только на строки со своими id.

Отдельно проверьте свой JSON парсится:

```bash
PYTHONIOENCODING=utf-8 PYTHONUTF8=1 \
  "C:/Users/Fozzi/AppData/Local/Python/pythoncore-3.14-64/python.exe" -c \
  "import json,glob; [json.load(open(f,encoding='utf-8')) for f in glob.glob('content/lessons/*.json')]; print('JSON ок')"
```

## Эталон

Три урока написаны вручную и задают планку — читайте их перед тем, как писать
свои:

- `start-01-chto-takoe-veb.json` + `.md` — quiz + task, теория «как устроен веб»
- `css-05-flexbox.json` + `.md` — CSS с браузерной автопроверкой
- `py-10-funktsii.json` + `.md` — Python с серверной автопроверкой
