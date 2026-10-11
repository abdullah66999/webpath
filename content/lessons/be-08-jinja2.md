## Зачем шаблоны, если мы уже умеем отдавать JSON

JSON нужен программам. HTML нужен людям: страница блога, личный кабинет, форма регистрации, письмо. Flask собирает его из **шаблонов** (templates) — HTML-файлов с дырками, куда подставляются данные. Движок называется Jinja2 и идёт в комплекте с Flask.

Jinja исполняется только на сервере. В браузер всегда уходит уже собранный HTML: фигурных скобок `{{ }}` клиент не видит никогда.

## render_template

Шаблоны лежат в папке `templates` рядом с `app.py`. Имена переменных, которые вы передаёте, становятся доступны внутри файла.

```python
from flask import Flask, render_template

app = Flask(__name__)


@app.get("/tasks")
def task_page():
    tasks = [
        {"id": 1, "title": "Купить молоко", "done": False},
        {"id": 2, "title": "Написать отчёт", "done": True},
    ]
    return render_template("tasks.html", tasks=tasks, page_title="Мои задачи")
```

```html
<h1>{{ page_title }}</h1>

<ul>
  {% for task in tasks %}
    <li>{{ task.title }}</li>
  {% endfor %}
</ul>
```

## Три вида скобок

- `{{ выражение }}` — вывести значение. Внутри работает почти обычный Python: `{{ task.title.upper() }}`, `{{ a + b }}`, `{{ user.name if user else "гость" }}`.
- `{% тег %}` — управляющая конструкция: `if`, `for`, `block`, `extends`, `include`, `set`, `macro`.
- `{# текст #}` — комментарий, в ответ не попадает.

Цикл даёт служебную переменную `loop`:

```html
{% for task in tasks %}
  <li>{{ loop.index }}. {{ task.title }}</li>
{% else %}
  <li>Задач пока нет</li>
{% endfor %}
```

Ветка `{% else %}` у цикла выполняется, если список пуст. `loop.index` начинается с единицы, `loop.first` и `loop.last` — логические значения.

Условия выглядят почти как в Python, только вместо отступов теги `{% if %}`, `{% elif %}`, `{% else %}`, `{% endif %}`. Логические связки — те же `and`, `or`, `not`:

```html
{% if tasks %}
  Всего: {{ tasks | length }}
{% elif show_empty %}
  Список пуст
{% endif %}
```

## Наследование: один каркас на весь сайт

Шапка, меню и подвал одинаковы на всех страницах. Их выносят в `base.html`, а страницы переопределяют только **блоки**.

```html
{# templates/base.html #}
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>{% block title %}Мои задачи{% endblock %}</title>
  <link rel="stylesheet" href="{{ url_for('static', filename='app.css') }}">
</head>
<body>
  <nav><a href="{{ url_for('task_page') }}">Задачи</a></nav>
  <main>{% block content %}{% endblock %}</main>
  <footer>© {{ year }}</footer>
</body>
</html>
```

```html
{# templates/tasks.html #}
{% extends "base.html" %}

{% block title %}Мои задачи — {{ page_title }}{% endblock %}

{% block content %}
  <ul>
    {% for task in tasks %}
      <li>{{ task.title }}</li>
    {% endfor %}
  </ul>
{% endblock %}
```

`{% extends %}` пишут первым тегом файла, до любого HTML: всё, что в дочернем шаблоне находится вне переопределённых блоков, в ответ не попадает. Для вставки готового куска (карточка, плашка ошибки) используют `{% include "partials/task_card.html" %}` — это другой механизм, он не создаёт иерархию.

## Фильтры

Фильтр — функция, применённая к значению через вертикальную черту:

```html
{{ title | trim | title }}
{{ description | truncate(120) }}
{{ tags | join(", ") }}
{{ nickname | default("аноним") }}
{{ price | round(2) }}
{{ payload | tojson }}
```

`tojson` особенно полезен, когда нужно передать данные из шаблона в JavaScript: он сериализует объект и корректно экранирует его для вставки в `<script>`.

## Автоэкранирование

Jinja по умолчанию экранирует HTML-спецсимволы в шаблонах `.html`, `.htm`, `.xml` и `.svg`. Если пользователь оставил комментарий `<script>alert(1)</script>`, посетитель увидит этот текст буквально, а не исполняемый код. Это защита от XSS (cross-site scripting).

Фильтр `|safe` отключает экранирование:

```html
{{ article_html | safe }}   <!-- только если HTML сгенерировали вы сами -->
```

Применять `|safe` к пользовательскому вводу нельзя — это дыра в один символ. Если нужно разрешить часть разметки, её вычищают отдельной библиотекой-санитизатором на сервере.

Отдельная ловушка: `render_template_string(user_text)` интерпретирует переданную строку как шаблон. Если в неё попал пользовательский ввод, атакующий сможет выполнить произвольный Python-код. Функция предназначена только для констант в вашем исходнике.

## Типичная ошибка: HTML там, где ждут JSON

Один обработчик на два сценария:

```python
@app.get("/tasks")
def tasks():
    if request.args.get("format") == "json":
        return jsonify(TASKS)
    return render_template("tasks.html", tasks=TASKS)
```

Это ещё полбеды, если о форматах договорились заранее. Настоящая беда — когда JSON-API и страницы смешаны в одном префиксе: клиент ловит `SyntaxError` при разборе HTML, а вы ищете баг в сериализации. Держите их раздельно: `/api/v1/tasks` всегда JSON, `/tasks` всегда HTML.

## Что дальше

Страницы научились показывать данные. Следующий урок — как узнавать посетителя: сессии, хеши паролей и `login_required`.
